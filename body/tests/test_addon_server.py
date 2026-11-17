# SPDX-FileCopyrightText: 2026 Blender Authors
#
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Unit tests for the Blender socket bridge's connection handling.

These tests run without Blender: they load the server module directly and
drive it with loopback sockets and socket pairs.
"""

import importlib.util
import json
import os
import select
import socket
import time
import unittest
from unittest import mock

_ADDON_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "addon",
    "blender_mcp_addon",
)
_SPEC = importlib.util.spec_from_file_location(
    "mcp_to_blender_server_under_test",
    os.path.join(_ADDON_DIR, "mcp_to_blender_server.py"),
)
assert _SPEC is not None and _SPEC.loader is not None
mcp = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(mcp)

_DEFAULT_MAX_CLIENTS = mcp.MAX_INCOMPLETE_CLIENTS


class _ServerTestCase(unittest.TestCase):
    """Reset shared server state around each test."""

    def setUp(self) -> None:
        self._peers: list[socket.socket] = []
        self._listener: socket.socket | None = None

    def tearDown(self) -> None:
        for peer in self._peers:
            peer.close()
        for client in mcp._state.clients[:]:  # pylint: disable=protected-access
            mcp._close_client(client)
        if self._listener is not None:
            self._listener.close()
        mcp._state.sock = None  # pylint: disable=protected-access
        mcp.MAX_INCOMPLETE_CLIENTS = _DEFAULT_MAX_CLIENTS

    def _pair(self) -> tuple[socket.socket, socket.socket]:
        server_sock, peer = socket.socketpair()
        server_sock.setblocking(False)
        peer.setblocking(False)
        self._peers.append(peer)
        return server_sock, peer

    def _add_client(self, sock: socket.socket) -> object:
        client = mcp._Client(sock)  # pylint: disable=protected-access
        mcp._state.clients.append(client)  # pylint: disable=protected-access
        return client

    def _pump(self, peer: socket.socket, timeout: float = 10.0) -> bytes:
        """Poll the server and drain *peer* until the server closes it."""
        received = bytearray()
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            mcp._service_clients()  # pylint: disable=protected-access
            readable, _, _ = select.select([peer], [], [], 0.01)
            if not readable:
                continue
            chunk = peer.recv(65536)
            if not chunk:
                break
            received.extend(chunk)
        return bytes(received)


class TestClientExpiry(_ServerTestCase):
    def test_client_deadline_is_monotonic(self) -> None:
        server_sock, _peer = self._pair()
        self.addCleanup(server_sock.close)
        before = time.monotonic()
        client = mcp._Client(server_sock)  # pylint: disable=protected-access
        self.assertGreaterEqual(client.deadline, before + mcp._CLIENT_TIMEOUT - 1.0)
        self.assertLessEqual(client.deadline, time.monotonic() + mcp._CLIENT_TIMEOUT + 1.0)

    def test_expiry_uses_deadline_not_tick_count(self) -> None:
        self.assertNotIn("timeout", mcp._Client.__slots__)
        self.assertNotIn("client_timeout_countdown", mcp._TimerState.__slots__)

    def test_expired_client_receives_error_then_closes(self) -> None:
        server_sock, peer = self._pair()
        client = self._add_client(server_sock)
        client.deadline = time.monotonic() - 1.0

        self.assertFalse(mcp._service_clients())
        self.assertTrue(client.pending, "timeout response should be queued")

        received = self._pump(peer)
        self.assertTrue(received.endswith(b"\0"), received)
        self.assertEqual(json.loads(received[:-1])["message"], "Client timed out")
        self.assertNotIn(client, mcp._state.clients)

    def test_fresh_client_survives_repeated_polls(self) -> None:
        server_sock, peer = self._pair()
        client = self._add_client(server_sock)

        for _ in range(20):
            mcp._service_clients()
            self.assertIn(client, mcp._state.clients)

        readable, _, _ = select.select([peer], [], [], 0)
        self.assertFalse(readable, "no response should be written to a silent client")


class TestClientCap(_ServerTestCase):
    def test_excess_connections_are_rejected_and_closed(self) -> None:
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(("127.0.0.1", 0))
        listener.listen(8)
        listener.setblocking(False)
        self._listener = listener
        mcp._state.sock = listener  # pylint: disable=protected-access
        mcp.MAX_INCOMPLETE_CLIENTS = 2

        port = listener.getsockname()[1]
        for _ in range(3):
            client_sock = socket.create_connection(("127.0.0.1", port))
            client_sock.setblocking(False)
            self._peers.append(client_sock)

        mcp._accept_clients()  # pylint: disable=protected-access

        self.assertEqual(len(mcp._state.clients), 2)

        rejected: dict[socket.socket, bytearray] = {}
        waiting = list(self._peers)
        deadline = time.monotonic() + 2.0
        while waiting and time.monotonic() < deadline:
            readable, _, _ = select.select(waiting, [], [], 0.05)
            for peer in readable:
                chunk = peer.recv(4096)
                if chunk:
                    rejected.setdefault(peer, bytearray()).extend(chunk)
                if not chunk or b"\0" in rejected.get(peer, b""):
                    waiting.remove(peer)

        self.assertEqual(len(rejected), 1, "exactly one connection is over the cap")
        payload = next(iter(rejected.values()))
        message = json.loads(bytes(payload[:-1]))
        self.assertEqual(message["status"], "error")
        self.assertIn("Too many pending clients", message["message"])


class TestBufferedWrites(_ServerTestCase):
    def test_large_response_drains_without_truncation(self) -> None:
        server_sock, peer = self._pair()
        server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 8192)
        client = self._add_client(server_sock)

        response = {"status": "ok", "result": {"blob": "x" * (1024 * 1024)}}
        expected = mcp._encode_response(response)
        mcp._queue_response_and_close(client, response)  # pylint: disable=protected-access

        mcp._service_clients()
        self.assertTrue(client.pending, "backpressure must leave the payload queued")
        self.assertIn(client, mcp._state.clients)

        received = self._pump(peer)
        self.assertEqual(len(received), len(expected))
        self.assertEqual(received, expected)
        self.assertTrue(received.endswith(b"\0"))
        self.assertEqual(json.loads(received[:-1]), response)
        self.assertNotIn(client, mcp._state.clients)

    def test_request_response_keeps_existing_framing(self) -> None:
        server_sock, peer = self._pair()
        client = self._add_client(server_sock)
        peer.sendall(b'{"type":"execute","strict_json":true,"code":"result={}"}\0')

        result = (mcp._ExecResult({"status": "ok", "result": {"a": 1}}), True)
        with mock.patch.object(mcp, "_execute_code_from_request", return_value=result):
            self.assertTrue(mcp._service_clients())

        received = self._pump(peer)
        self.assertTrue(received.endswith(b"\0"))
        self.assertEqual(json.loads(received[:-1]), {"status": "ok", "result": {"a": 1}})
        self.assertNotIn(client, mcp._state.clients)

    def test_non_blocking_clients_never_use_sendall(self) -> None:
        with open(os.path.join(_ADDON_DIR, "mcp_to_blender_server.py"), encoding="utf-8") as handle:
            source = handle.read()
        self.assertNotIn("client.conn.sendall", source)


if __name__ == "__main__":
    unittest.main()
