import asyncio
from winrt.windows.devices.radios import Radio, RadioKind, RadioState

async def main():
    radios = await Radio.get_radios_async()
    for r in radios:
        print(f"Name: {r.name}, Kind: {r.kind}, State: {r.state}")

asyncio.run(main())
