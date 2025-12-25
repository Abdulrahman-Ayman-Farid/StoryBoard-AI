# StoryBoard AI

StoryBoard AI is a state-of-the-art web application designed for filmmakers, directors, and content creators to instantly visualize their scripts. Powered by **Google Gemini 2.5 Flash** for script analysis and **Imagen** for high-fidelity image generation, this tool transforms raw text into a cinematic storyboard timeline.

## Features

### 🎬 AI Script Analysis
-   **Scene Decomposition**: Automatically breaks down screenplay format text into individual scenes.
-   **Context Awareness**: Understands lighting, mood, and action from the script context.
-   **Prompt Engineering**: Automatically generates optimized visual prompts for image generation.

### 🖼️ Generative Visualization
-   **Cinematic Rendering**: Uses advanced diffusion models to generate photorealistic or stylized frames.
-   **Aspect Ratio Control**: Support for 16:9 (Cinematic), 4:3 (TV), 1:1 (Square), and 3:4 (Portrait).
-   **Resolution Control**: Options for fast previews (1K) or high-detail renders (4K).

### 🛠️ Creative Control
-   **Visual Prompt Editor**: Edit the AI-generated prompts manually to refine the vision.
-   **AI Enhance**: One-click enhancement of prompts to add detail, lighting, and camera specificities.
-   **Regeneration**: Re-roll specific scenes or images until they match your vision.

### ⏱️ Timeline & Versioning
-   **Project Snapshots**: Save the entire state of your storyboard (text + images) to a local history.
-   **Restore Points**: Instantly revert to any previous version of your project.
-   **Local Persistence**: Projects are saved to your browser's local storage.

## Tech Stack

-   **Frontend**: Angular v21 (Zoneless, Signals architecture)
-   **Styling**: Tailwind CSS (Glassmorphism / Liquid UI)
-   **AI Integration**: @google/genai SDK
-   **Models**: 
    -   `gemini-2.5-flash` (Text/Logic)
    -   `imagen-4.0-generate-001` (Image Generation)

## Getting Started

1.  **Enter Script**: Paste your screenplay into the sidebar.
2.  **Analyze**: Click "Generate Storyboard" to break down the script.
3.  **Render**: Use "Render Sequence" to generate images for all scenes, or generate them individually.
4.  **Refine**: Click "Enhance" on prompts or edit text to adjust the output.

## UI Design

The interface features a **Liquid Glassy** aesthetic:
-   **Deep Layering**: High `backdrop-blur` values create a sense of depth.
-   **Fluid Backgrounds**: Animated gradient orbs provide a dynamic, living backdrop.
-   **Tactile Interactions**: Hover effects, glow borders, and smooth transitions.

---

*Powered by Google Gemini*
