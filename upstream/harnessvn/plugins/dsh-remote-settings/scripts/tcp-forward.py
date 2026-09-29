#!/usr/bin/env python3
"""Tiny raw-TCP forwarder: expose the loopback-only dsh test server on the LAN
IP so a browser sees a non-loopback origin (and the /api fence accepts it as a
declared trusted host). Raw TCP keeps the WebSocket upgrade transparent.
"""
import asyncio
import sys

LISTEN_HOST, LISTEN_PORT, TARGET_HOST, TARGET_PORT = sys.argv[1], int(sys.argv[2]), sys.argv[3], int(sys.argv[4])


async def pump(reader, writer):
    try:
        while True:
            chunk = await reader.read(65536)
            if not chunk:
                break
            writer.write(chunk)
            await writer.drain()
    except Exception:
        pass
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def handle(client_reader, client_writer):
    try:
        target_reader, target_writer = await asyncio.open_connection(TARGET_HOST, TARGET_PORT)
    except Exception:
        client_writer.close()
        return
    await asyncio.gather(
        pump(client_reader, target_writer),
        pump(target_reader, client_writer),
    )


async def main():
    server = await asyncio.start_server(handle, LISTEN_HOST, LISTEN_PORT)
    print(f"forwarding {LISTEN_HOST}:{LISTEN_PORT} -> {TARGET_HOST}:{TARGET_PORT}", flush=True)
    async with server:
        await server.serve_forever()


asyncio.run(main())
