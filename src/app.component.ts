import { Component, ChangeDetectorRef, inject, signal, ChangeDetectionStrategy, ElementRef, ViewChild } from '@angular/core';
import { GeminiService } from './services/gemini.service';
import { Chat, GenerateContentResponse } from '@google/genai';

interface Scene {
  sceneNumber: number;
  description: string;
  visualPrompt: string;
  imageUrl?: string;
  isGenerating?: boolean;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
  geminiService = inject(GeminiService);
  cdr = inject(ChangeDetectorRef);

  // Script State
  scriptText = signal<string>('');
  scenes = signal<Scene[]>([]);
  isAnalyzing = signal<boolean>(false);
  
  // Image Config
  selectedAspectRatio = signal<string>('16:9');
  selectedResolution = signal<string>('2K'); // 1K, 2K, 4K
  
  // Chat State
  isChatOpen = signal<boolean>(false);
  chatInput = signal<string>('');
  chatMessages = signal<ChatMessage[]>([]);
  isChatSending = signal<boolean>(false);
  private chatSession: Chat | null = null;
  
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  constructor() {
    // Initialize Chat
    this.chatSession = this.geminiService.getChatModel();
    this.addBotMessage("Hello! I'm your Storyboard Assistant. How can I help you with your script today?");
  }

  // --- Storyboard Logic ---

  async analyzeScript() {
    if (!this.scriptText()) return;

    this.isAnalyzing.set(true);
    this.scenes.set([]); 
    this.safeDetectChanges();

    try {
      const result = await this.geminiService.analyzeScript(this.scriptText());
      this.scenes.set(result.map((s: any) => ({ ...s, isGenerating: false })));
    } catch (error) {
      alert('Failed to analyze script. Please try again.');
      console.error(error);
    } finally {
      this.isAnalyzing.set(false);
      this.safeDetectChanges();
    }
  }

  async generateImageForScene(scene: Scene) {
    if (scene.isGenerating) return;

    // Update specific scene state
    this.updateSceneState(scene.sceneNumber, { isGenerating: true });

    try {
      // Append resolution to prompt as a quality hint since API doesn't support direct resolution param
      const enhancedPrompt = `${scene.visualPrompt}, highly detailed, ${this.selectedResolution()} resolution, cinematic lighting, masterpiece`;
      
      const imageUrl = await this.geminiService.generateImage(enhancedPrompt, this.selectedAspectRatio());
      
      this.updateSceneState(scene.sceneNumber, { imageUrl, isGenerating: false });
    } catch (error) {
      console.error(error);
      this.updateSceneState(scene.sceneNumber, { isGenerating: false });
      alert(`Failed to generate image for Scene ${scene.sceneNumber}`);
    }
  }

  async generateAllImages() {
    const currentScenes = this.scenes();
    for (const scene of currentScenes) {
      if (!scene.imageUrl) {
        await this.generateImageForScene(scene);
      }
    }
  }

  private updateSceneState(sceneNumber: number, updates: Partial<Scene>) {
    this.scenes.update(prev => 
      prev.map(s => s.sceneNumber === sceneNumber ? { ...s, ...updates } : s)
    );
    this.safeDetectChanges();
  }

  // --- Chat Logic ---

  toggleChat() {
    this.isChatOpen.update(v => !v);
    this.safeDetectChanges();
  }

  async sendChatMessage() {
    const text = this.chatInput().trim();
    if (!text || this.isChatSending()) return;

    // Add user message
    this.chatMessages.update(msgs => [...msgs, { role: 'user', text }]);
    this.chatInput.set('');
    this.isChatSending.set(true);
    this.safeDetectChanges();
    this.scrollToBottom();

    try {
      if (!this.chatSession) {
        this.chatSession = this.geminiService.getChatModel();
      }

      const response: GenerateContentResponse = await this.chatSession.sendMessage({ message: text });
      this.addBotMessage(response.text);

    } catch (error) {
      console.error(error);
      this.addBotMessage("Sorry, I encountered an error. Please try again.");
    } finally {
      this.isChatSending.set(false);
      this.safeDetectChanges();
      this.scrollToBottom();
    }
  }

  private addBotMessage(text: string) {
    this.chatMessages.update(msgs => [...msgs, { role: 'model', text }]);
    this.safeDetectChanges();
    this.scrollToBottom();
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      }
    }, 100);
  }

  // Helper to prevent "Should be run in update mode" assertion error
  // by breaking the synchronous call stack.
  private safeDetectChanges() {
    setTimeout(() => {
      this.cdr.detectChanges();
    }, 0);
  }
}