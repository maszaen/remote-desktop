# Nexus Controller

Nexus Controller is a cross-platform remote control system designed to interface dynamically between a mobile device and a desktop environment. It consists of a React Native mobile application functioning as the controller and a Python-based server tray application running on the target desktop machine.

This monorepo houses both the client application and the host server, enabling a seamless, localized communication bridge over standard network protocols.

## Repository Structure

The architecture is divided into primarily two distinct projects:

- **mobile-controller**
  - **Description:** A cross-platform mobile application built utilizing React Native and Expo.
  - **Role:** Functions as the primary user interface to issue commands, manage media, and monitor the host machine's statistics in real-time.

- **server-tray-app**
  - **Description:** A streamlined, fast-executing backend built with Python and FastAPI, designed to reside in the system tray.
  - **Role:** Acts as the host-side listener processing incoming requests to execute system-level operations (e.g., media playback control, input simulation, volume adjustment, system monitoring).

## Getting Started

### Prerequisites

Ensure the following dependencies are installed within your development environment:

- **Node.js** (v18.x or later recommended)
- **Python** (v3.9 or later recommended)
- **Expo CLI** (for mobile application development)
- **Pip** (for Python package management)

### Server App Setup

Navigate to the `server-tray-app` directory and initialize the backend server.

```bash
cd server-tray-app
pip install -r requirements.txt
python main.py
```

The server binds to the local network IP and exposes an API used by the mobile client. It will appear as an icon in your system tray on Windows environments. Note that advanced commands for automated building are available in the accompanying `.ps1` and `.spec` scripts.

### Mobile App Setup

Navigate to the `mobile-controller` directory to run the Expo project. 

```bash
cd mobile-controller
npm install
npm start
```

Upon starting the local Metro server, utilize the Expo Go app on your physical device or an emulator to launch and test the user interface.

## Architecture & Technology Stack

**Host Server:**
- **Framework:** FastAPI / Uvicorn
- **System Interactions:** `pyautogui`, `pydirectinput`, `pycaw`, `psutil`
- **Application Management:** `pystray` (for localized system tray management)

**Mobile Client:**
- **Framework:** React Native / Expo
- **Key Modules:** `@react-native-async-storage/async-storage`, `expo-camera` (for potential QR or dynamic scanning integration).

## Communication Protocol

The client communicates directly with the server over the Local Area Network (LAN) by targeting the IP address of the machine running the server tray application. Traffic leverages standard HTTP requests (managed by FastAPI). Ensure both devices are connected to the same network and that appropriate firewall exceptions have been configured for local API traffic.

## Licensing

Please refer to the repository administrator for usage and contribution guidelines.
