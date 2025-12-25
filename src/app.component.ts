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
  isEnhancingPrompt?: boolean;
  statusMessage?: string;
  errorMessage?: string; // New property for user-facing errors
  promptHistory?: Array<{ prompt: string, imageUrl?: string }>;
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

  // Notification State
  notification = signal<string | null>(null);
  
  // Drag and Drop State
  draggedIndex = signal<number | null>(null);
  dragOverIndex = signal<number | null>(null);
  
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  constructor() {
    // Initialize Chat
    this.chatSession = this.geminiService.getChatModel();
    this.addBotMessage("Hello! I'm your Storyboard Assistant. How can I help you with your script today?");
  }

  // --- Persistence Logic ---

  saveProject() {
    const data = {
      script: this.scriptText(),
      scenes: this.scenes(),
      aspectRatio: this.selectedAspectRatio(),
      resolution: this.selectedResolution(),
      chatHistory: this.chatMessages() // Optional: save chat too
    };

    try {
      localStorage.setItem('STORYBOARD_AI_DATA', JSON.stringify(data));
      this.showNotification('Project saved successfully');
    } catch (e: any) {
      console.error('Save failed', e);
      if (e.name === 'QuotaExceededError') {
        this.showNotification('Error: Project is too large to save (image limit).');
      } else {
        this.showNotification('Failed to save project.');
      }
    }
  }

  loadProject() {
    try {
      const raw = localStorage.getItem('STORYBOARD_AI_DATA');
      if (raw) {
        const data = JSON.parse(raw);
        
        // Restore state
        if (data.script) this.scriptText.set(data.script);
        if (data.scenes) this.scenes.set(data.scenes);
        if (data.aspectRatio) this.selectedAspectRatio.set(data.aspectRatio);
        if (data.resolution) this.selectedResolution.set(data.resolution);
        if (data.chatHistory) this.chatMessages.set(data.chatHistory);

        this.showNotification('Project loaded successfully');
        this.triggerUpdate();
      } else {
        this.showNotification('No saved project found.');
      }
    } catch (e) {
      console.error('Load failed', e);
      this.showNotification('Failed to load project data.');
    }
  }

  showNotification(message: string) {
    this.notification.set(message);
    this.triggerUpdate();
    setTimeout(() => {
      this.notification.set(null);
      this.triggerUpdate();
    }, 3000);
  }

  // --- Drag and Drop Logic ---

  onDragStart(event: DragEvent, index: number) {
    this.draggedIndex.set(index);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', index.toString());
    }
  }

  onDragOver(event: DragEvent, index: number) {
    event.preventDefault(); // Allow drop
    if (this.draggedIndex() === null || this.draggedIndex() === index) return;
    
    // Only update signal if changed to prevent unnecessary checking
    if (this.dragOverIndex() !== index) {
      this.dragOverIndex.set(index);
      this.triggerUpdate();
    }
    
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDrop(event: DragEvent, index: number) {
    event.preventDefault();
    const fromIndex = this.draggedIndex();
    
    if (fromIndex !== null && fromIndex !== index) {
      this.reorderScenes(fromIndex, index);
      this.showNotification('Scene reordered');
    }
    
    this.resetDragState();
  }
  
  onDragEnd(event: DragEvent) {
    this.resetDragState();
  }
  
  onDragLeave(event: DragEvent) {
    // Optional
  }

  private resetDragState() {
    this.draggedIndex.set(null);
    this.dragOverIndex.set(null);
    this.triggerUpdate();
  }

  private reorderScenes(fromIndex: number, toIndex: number) {
    const currentScenes = [...this.scenes()];
    const item = currentScenes.splice(fromIndex, 1)[0];
    currentScenes.splice(toIndex, 0, item);
    this.scenes.set(currentScenes);
  }

  // --- Storyboard Logic ---

  async analyzeScript() {
    if (!this.scriptText()) return;

    this.isAnalyzing.set(true);
    this.scenes.set([]); 
    this.triggerUpdate();

    try {
      const result = await this.geminiService.analyzeScript(this.scriptText());
      this.scenes.set(result.map((s: any) => ({ 
        ...s, 
        isGenerating: false, 
        isRegeneratingText: false, 
        isEnhancingPrompt: false,
        statusMessage: '',
        errorMessage: undefined,
        promptHistory: [] 
      })));
      
      // Automatically generate images for all new scenes
      this.generateAllImages();
      
    } catch (error) {
      // For script analysis, we use the main notification/alert as it's a global failure
      this.showNotification('Failed to analyze script. Please check your API key or try again.');
      console.error(error);
    } finally {
      this.isAnalyzing.set(false);
      this.triggerUpdate();
    }
  }

  async regenerateSceneText(scene: Scene) {
    if (scene.isRegeneratingText || !this.scriptText()) return;

    this.updateSceneState(scene.sceneNumber, { 
      isRegeneratingText: true, 
      errorMessage: undefined // Clear previous errors
    });

    try {
      const result = await this.geminiService.regenerateScene(this.scriptText(), scene.sceneNumber);
      
      // Capture history before update
      const historyItem = { prompt: scene.visualPrompt, imageUrl: scene.imageUrl };

      this.updateSceneState(scene.sceneNumber, {
        description: result.description,
        visualPrompt: result.visualPrompt,
        imageUrl: undefined, // Clear image as prompt changed
        isRegeneratingText: false,
        promptHistory: [...(scene.promptHistory || []), historyItem]
      });
    } catch (error) {
      console.error(error);
      this.updateSceneState(scene.sceneNumber, { 
        isRegeneratingText: false,
        errorMessage: 'Text generation failed. Please try again.'
      });
    }
  }

  async enhancePromptForScene(scene: Scene) {
    if (scene.isEnhancingPrompt || scene.isGenerating) return;

    this.updateSceneState(scene.sceneNumber, { 
      isEnhancingPrompt: true,
      errorMessage: undefined 
    });

    try {
      const enhancedPrompt = await this.geminiService.enhancePrompt(scene.visualPrompt);
      
      if (enhancedPrompt !== scene.visualPrompt) {
         const historyItem = { prompt: scene.visualPrompt, imageUrl: scene.imageUrl };
         this.updateSceneState(scene.sceneNumber, {
           visualPrompt: enhancedPrompt,
           isEnhancingPrompt: false,
           promptHistory: [...(scene.promptHistory || []), historyItem]
         });
         this.showNotification('Prompt enhanced');
      } else {
         this.updateSceneState(scene.sceneNumber, { isEnhancingPrompt: false });
         this.showNotification('Prompt is already optimized');
      }
    } catch (error) {
      console.error(error);
      this.updateSceneState(scene.sceneNumber, { 
        isEnhancingPrompt: false,
        errorMessage: 'Prompt enhancement failed.'
      });
    }
  }

  async generateImageForScene(scene: Scene) {
    if (scene.isGenerating) return;

    // Update specific scene state
    this.updateSceneState(scene.sceneNumber, { 
      isGenerating: true, 
      statusMessage: 'Enhancing prompt...',
      errorMessage: undefined 
    });

    try {
      // 1. Enhance the prompt first
      const enhancedPrompt = await this.geminiService.enhancePrompt(scene.visualPrompt);
      
      // Capture history if prompt changed (it almost always does)
      let historyUpdate = {};
      if (enhancedPrompt !== scene.visualPrompt) {
         const historyItem = { prompt: scene.visualPrompt, imageUrl: scene.imageUrl };
         historyUpdate = { promptHistory: [...(scene.promptHistory || []), historyItem] };
      }
      
      // Update the scene with the enhanced prompt so the user sees what was used
      this.updateSceneState(scene.sceneNumber, { 
        visualPrompt: enhancedPrompt,
        statusMessage: 'Rendering image...',
        ...historyUpdate
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

    } catch (error: any) {
      console.error('Image Generation Error:', error);
      
      let friendlyError = 'Image generation failed.';
      if (error.message?.includes('429')) {
        friendlyError = 'Usage limit exceeded. Please wait a moment.';
      } else if (error.message?.includes('safety')) {
        friendlyError = 'Generation blocked by safety settings. Try a different prompt.';
      } else {
         friendlyError = 'Connection interrupted. Please retry.';
      }

      this.updateSceneState(scene.sceneNumber, { 
        isGenerating: false,
        statusMessage: 'Failed',
        errorMessage: friendlyError
      });
    }
  }

  async generateAllImages() {
    const currentScenes = this.scenes();
    for (const scene of currentScenes) {
      if (!scene.imageUrl && !scene.isGenerating) {
        await this.generateImageForScene(scene);
      }
    }
  }

  revertToPreviousVersion(scene: Scene) {
    if (!scene.promptHistory || scene.promptHistory.length === 0) return;
    
    const previous = scene.promptHistory[scene.promptHistory.length - 1];
    const newHistory = scene.promptHistory.slice(0, -1);
    
    this.updateSceneState(scene.sceneNumber, {
      visualPrompt: previous.prompt,
      imageUrl: previous.imageUrl,
      promptHistory: newHistory,
      statusMessage: undefined,
      errorMessage: undefined
    });
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