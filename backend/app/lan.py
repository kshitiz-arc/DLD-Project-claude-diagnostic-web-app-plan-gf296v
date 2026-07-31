"""LAN helpers for the projector page (plan §9).

The lab is assumed **air-gapped**: nothing here may reach the internet. IP
discovery is a local socket trick, and the QR code is rendered by ``segno``
(pure Python, no network, no native build) when it is installed. If it isn't,
the page still works — it just shows the URL, which is the part that matters.
"""

from __future__ import annotations

import os
import socket
from typing import List, Optional


def local_ips() -> List[str]:
    """Best-effort list of this host's LAN addresses, most useful first.

    The UDP-connect trick reveals the address the OS would actually use to
    reach a remote host — on a laptop running Mobile Hotspot that is usually
    the hotspot adapter, which is exactly the one students must type.
    """
    found: List[str] = []

    def add(ip: Optional[str]) -> None:
        if ip and not ip.startswith("127.") and ip not in found:
            found.append(ip)

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("10.255.255.255", 1))  # no packet is sent
        add(sock.getsockname()[0])
    except OSError:  # pragma: no cover - no route at all
        pass
    finally:
        sock.close()

    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            add(info[4][0])
    except OSError:  # pragma: no cover - odd hostname setups
        pass
    return found


def server_urls(port: int) -> List[str]:
    """Every URL a lab PC could use to reach this server."""
    return [f"http://{ip}:{port}" for ip in local_ips()]


def qr_svg(url: str, scale: int = 8) -> Optional[str]:
    """Inline SVG QR code for ``url``, or ``None`` when ``segno`` is absent.

    segno emits ``width``/``height`` but no ``viewBox``, which leaves the SVG
    with no scalable coordinate system: CSS can resize the *box* while the
    artwork stays pinned at its natural size, so the code sits in the top-left
    of an over-large frame — and is cropped outright once the box is smaller
    than the code, which is what a projector at any modest width produces.

    Adding the viewBox makes it scale properly. The intrinsic width/height are
    kept alongside it so the code still has a sensible size if the page's CSS
    never loads, and so ``height: auto`` has a ratio to work from.
    """
    try:
        import segno  # type: ignore
    except ImportError:
        return None
    import io
    import re

    # segno's SVG serializer emits bytes; the page needs a str to inline.
    buf = io.BytesIO()
    segno.make(url, error="m").save(buf, kind="svg", scale=scale, xmldecl=False, svgns=True)
    svg = buf.getvalue().decode("utf-8")

    # Guarded so a future segno that emits its own viewBox is left alone.
    if "viewBox" not in svg:
        dims = re.search(r'<svg[^>]*?\bwidth="([\d.]+)"[^>]*?\bheight="([\d.]+)"', svg)
        if dims:
            svg = svg.replace(
                "<svg", f'<svg viewBox="0 0 {dims.group(1)} {dims.group(2)}"', 1
            )
    return svg


def default_port() -> int:
    return int(os.environ.get("PORT", "8000"))
