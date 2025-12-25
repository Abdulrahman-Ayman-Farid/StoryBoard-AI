import { Component, inject, signal, computed, ChangeDetectionStrategy, ElementRef, ViewChild, ApplicationRef } from '@angular/core';
import { GeminiService } from './services/gemini.service';
import { Chat, GenerateContentResponse } from '@google/genai';

interface Scene {
  sceneNumber: number;
  description: string;
  visualPrompt: string;
  imageUrl?: string;
  isGenerating?: boolean;
  isRegeneratingText?: boolean;
  statusMessage?: string;
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
  private geminiService = inject(GeminiService);
  private appRef = inject(ApplicationRef);

  // Script State
  scriptText = signal<string>('');
  scenes = signal<Scene[]>([]);
  isAnalyzing = signal<boolean>(false);
  
  // Image Config
  selectedAspectRatio = signal<string>('16:9');
  selectedResolution = signal<string>('2K'); // 1K, 2K, 4K

  // Computed Style for Aspect Ratio
  aspectRatioStyle = computed(() => {
    return this.selectedAspectRatio().replace(':', '/');
  });
  
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
    this.triggerUpdate();

    try {
      const result = await this.geminiService.analyzeScript(this.scriptText());
      this.scenes.set(result.map((s: any) => ({ ...s, isGenerating: false, isRegeneratingText: false, statusMessage: '' })));
      
      // Automatically generate images for all new scenes
      this.generateAllImages();
      
    } catch (error) {
      alert('Failed to analyze script. Please try again.');
      console.error(error);
    } finally {
      this.isAnalyzing.set(false);
      this.triggerUpdate();
    }
  }

  async regenerateSceneText(scene: Scene) {
    if (scene.isRegeneratingText || !this.scriptText()) return;

    this.updateSceneState(scene.sceneNumber, { isRegeneratingText: true });

    try {
      const result = await this.geminiService.regenerateScene(this.scriptText(), scene.sceneNumber);
      this.updateSceneState(scene.sceneNumber, {
        description: result.description,
        visualPrompt: result.visualPrompt,
        imageUrl: undefined, // Clear image as prompt changed
        isRegeneratingText: false
      });
    } catch (error) {
      console.error(error);
      this.updateSceneState(scene.sceneNumber, { isRegeneratingText: false });
      alert(`Failed to regenerate text for Scene ${scene.sceneNumber}`);
    }
  }

  async generateImageForScene(scene: Scene) {
    if (scene.isGenerating) return;

    // Update specific scene state
    this.updateSceneState(scene.sceneNumber, { isGenerating: true, statusMessage: 'Enhancing prompt...' });

    try {
      // 1. Enhance the prompt first
      const enhancedPrompt = await this.geminiService.enhancePrompt(scene.visualPrompt);
      
      // Update the scene with the enhanced prompt so the user sees what was used
      this.updateSceneState(scene.sceneNumber, { 
        visualPrompt: enhancedPrompt,
        statusMessage: 'Rendering image...'
      });

      // 2. Generate the image
      // We append resolution here as a final bias
      const finalPrompt = `${enhancedPrompt}, ${this.selectedResolution()} resolution`;
      const imageUrl = await this.geminiService.generateImage(finalPrompt, this.selectedAspectRatio());
      
      this.updateSceneState(scene.sceneNumber, { 
        imageUrl, 
        isGenerating: false,
        statusMessage: undefined
      });

    } catch (error) {
      console.error(error);
      this.updateSceneState(scene.sceneNumber, { 
        isGenerating: false,
        statusMessage: 'Failed'
      });
      // alert(`Failed to generate image for Scene ${scene.sceneNumber}`); // Reduce alert noise
    }
  }

  async generateAllImages() {
    const currentScenes = this.scenes();
    
    // We can run these in parallel chunks to speed it up, or strictly sequential.
    // Sequential is safer for rate limits and simpler to reason about status updates.
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
    this.triggerUpdate();
  }

  // --- Chat Logic ---

  toggleChat() {
    this.isChatOpen.update(v => !v);
    this.triggerUpdate();
  }

  async sendChatMessage() {
    const text = this.chatInput().trim();
    if (!text || this.isChatSending()) return;

    // Add user message
    this.chatMessages.update(msgs => [...msgs, { role: 'user', text }]);
    this.chatInput.set('');
    this.isChatSending.set(true);
    this.triggerUpdate();
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
      this.triggerUpdate();
      this.scrollToBottom();
    }
  }

  private addBotMessage(text: string) {
    this.chatMessages.update(msgs => [...msgs, { role: 'model', text }]);
    this.triggerUpdate();
    this.scrollToBottom();
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      }
    }, 100);
  }

  // --- Helpers ---

  onScriptInput(event: Event) {
    const val = (event.target as HTMLTextAreaElement).value;
    this.scriptText.set(val);
    // Trigger update so the button disabled state re-evaluates
    this.triggerUpdate();
  }
  
  onResolutionChange(event: Event) {
    const val = (event.target as HTMLSelectElement).value;
    this.selectedResolution.set(val);
    this.triggerUpdate();
  }

  onAspectRatioChange(event: Event) {
    const val = (event.target as HTMLSelectElement).value;
    this.selectedAspectRatio.set(val);
    this.triggerUpdate();
  }
  
  onChatInput(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.chatInput.set(val);
    this.triggerUpdate();
  }

  // Safely trigger change detection for the whole app
  private triggerUpdate() {
    // We use setTimeout to decouple from the current execution stack (e.g. event handlers)
    // and ensure we don't violate signal graph update phases.
    setTimeout(() => {
      this.appRef.tick();
    }, 0);
  }
}