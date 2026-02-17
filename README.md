# ✒️ Lemba

**Focus on writing. We handle the rest.**

Lemba is a modern, open-source, offline-first Markdown editor designed for writers, researchers, and power users. It combines the simplicity of Markdown with the power of professional typesetting (powered by Typst) and the flexibility of Notion-style visual editing.

[Launch Online](https://www.lemba.app/) | [Download for Desktop](#desktop-builds) | [Documentation](#)

## 📖 Table of Contents

* [Key Features](#-key-features)
  * [Dual-Mode Editing](#-dual-mode-editing)
  * [Real-time PDF Rendering](#-real-time-pdf-rendering-powered-by-typst)
  * [Custom Templates](#-your-documents-your-style)
  * [Privacy & Offline-First](#-privacy--offline-first)
  * [AI Assistant](#-ai-assistant-beta)
* [Technology Stack](#-technology-stack)
* [Getting Started](#-getting-started)
  * [Prerequisites](#prerequisites)
  * [Local Development](#local-development)
  * [Desktop Builds](#desktop-builds)
* [Roadmap](#-roadmap)
* [Contributing](#-contributing)
* [License](#-license)
* [Contact](#-contact)

## ✨ Key Features

### 🛠️ Dual-Mode Editing

Switch seamlessly between a distraction-free **Raw Markdown** editor and a rich **Visual WYSIWYG** experience. No context switching, no lag—just pure flow.

* **Raw Mode:** Full control over syntax and frontmatter.
* **Visual Mode:** Focus on structure with an Obsidian/Notion-like interface.

### 📄 Real-time PDF Rendering (Powered by Typst)

Forget generic Markdown exports. Lemba uses a lightning-fast engine to render production-ready PDFs as you type.

* **High-fidelity previews:** See exactly how your document will look on paper.
* **Professional Typography:** Benefit from Typst's superior layout engine.

### 🎨 Your Documents, Your Style

Go beyond basic themes. Lemba features a powerful **Template Editor**.

* **Custom Templates:** Control every detail of typography, spacing, and layout.
* **Document Variables:** Reuse content throughout your document. Update a value once, and it reflects everywhere.
* **Style Sharing:** Export and share your style configurations.

### 🔒 Privacy & Offline-First

Your data stays on your device. Lemba is built to work 100% offline, ensuring total privacy and reliability.

* **Local-first:** Files are saved to your local file system or browser storage.
* **Cloud Sync (Beta):** Optional encrypted sync to keep your work available across devices.

### 🤖 AI Assistant (Beta)

Draft, refine, and expand your Markdown with a built-in AI agent.

* **In-context edits:** Get suggestions without leaving the editor.
* **Smart Polish:** Transform rough notes into polished professional documents instantly.

## 🚀 Technology Stack

Lemba is built with modern web technologies to ensure performance across web and desktop:

* **Frontend:** [Next.js](https://nextjs.org/) (React)
* **Editor:** Custom engine with Markdown support
* **PDF Engine:** [Typst](https://typst.app/)
* **Desktop Wrapper:** [Electron](https://www.electronjs.org/)
* **Styling:** Tailwind CSS

## 🛠️ Getting Started

### Prerequisites

* Node.js (v18 or higher)
* npm / yarn / pnpm

### Local Development

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/zeemarquez/lemba.git](https://github.com/zeemarquez/lemba.git)
   cd lemba