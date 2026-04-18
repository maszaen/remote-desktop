import asyncio
from winrt.windows.devices.radios import Radio, RadioKind, RadioState

async def main():
    radios = await Radio.get_radios_async()
    for r in radios:
        if r.kind == RadioKind.BLUETOOTH:
            await r.set_state_async(RadioState.OFF)

asyncio.run(main())
