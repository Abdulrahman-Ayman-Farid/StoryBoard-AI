# StoryBoard AI 🎬

> **Turn your words into worlds.**  
> A professional, AI-powered pre-visualization tool for directors, screenwriters, and creators.

StoryBoard AI transforms raw screenplay text into fully visualized cinematic timelines. By leveraging **Google Gemini 2.5 Flash** for deep narrative understanding and **Imagen** for high-fidelity image synthesis, it reduces the time from script to storyboard from days to minutes.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Angular](https://img.shields.io/badge/Angular-v21-red)
![AI](https://img.shields.io/badge/Powered%20by-Gemini-purple)

## ✨ Key Features

### 🧠 Intelligent Script Analysis
*   **Context-Aware Parsing**: Automatically detects sluglines (INT./EXT.), character actions, and transitions.
*   **Smart Grouping**: Options to organize scenes by narrative flow, page count, or custom batches.
*   **Prompt Engineering**: The AI automatically translates script descriptions into detailed photography prompts (lighting, camera angles, lens types).

### 🎨 Cinematic Visualization
*   **High-Fidelity Rendering**: Generates photorealistic or stylized images using Imagen.
*   **Aspect Ratio Support**: 
    *   `16:9` Cinematic
    *   `21:9` Ultra-Wide
    *   `4:3` TV/IMAX
    *   `1:1` Social/Square
*   **Resolution Control**: Draft (1K) for speed or Production (4K) for detail.

### 🛠️ Director's Suite
*   **Visual Prompt Editor**: Fine-tune the AI's vision. Edit the prompt manually or use the **"AI Enhance"** button to add cinematic vocabulary automatically.
*   **Scene Management**: Drag-and-drop scenes to reorder, split sequences, or merge acts.
*   **History & Versioning**: Create snapshots of your project. Experiment freely and revert to previous versions instantly.
*   **PDF Export**: Download a professional production-ready PDF shot list.

---

## 🚀 Getting Started

1.  **Paste Your Script**: Use the sidebar to enter your screenplay. (Standard Fountain or PDF-style formatting works best).
2.  **Configure**: Select your grouping strategy (e.g., "Smart Analysis") and desired aspect ratio.
3.  **Analyze**: Click **"Analyze Script"**. The AI will break down your text into scene cards.
4.  **Visualize**: Click **"Generate Image"** on specific scenes or render the entire sequence at once.
5.  **Refine**: 
    *   Use the *Prompt Box* to tweak lighting or camera angles.
    *   Use *Director's Notes* to add technical requirements.
6.  **Export**: Click "Export PDF" to share with your crew.

---

## 🏗️ Technical Architecture

Built with modern web standards for performance and scalability.

*   **Framework**: Angular v21 (Zoneless, Signals-based architecture)
*   **Styling**: Tailwind CSS with a custom Glassmorphism/Liquid design system.
*   **AI SDK**: `@google/genai`
*   **State Management**: LocalStorage persistence with deep-copy snapshotting.
*   **PDF Generation**: `jspdf` for client-side rendering.

## 🤖 Models Used

| Task | Model | Description |
| :--- | :--- | :--- |
| **Reasoning & Logic** | `gemini-2.5-flash` | Analyzes script structure, extracts scenes, and writes visual prompts. |
| **Image Synthesis** | `imagen-4.0-generate-001` | Generates the actual storyboard frames based on the prompts. |

---

## 🔮 Future Roadmap

*   **Multi-Character Consistency**: Character LoRAs to keep actors consistent across shots.
*   **Camera Motion Arrows**: Overlay annotations for pan, tilt, and zoom.
*   **Audio Animatics**: Generate temporary voice-overs and sound effects.

---

*Built for the Google Gemini Developer Competition.*
