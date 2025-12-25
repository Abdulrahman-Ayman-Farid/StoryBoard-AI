import { Component, inject, signal, computed, ChangeDetectionStrategy, ElementRef, ViewChild, ApplicationRef } from '@angular/core';
import { GeminiService } from './services/gemini.service';
import { Chat, GenerateContentResponse } from '@google/genai';
import { DatePipe, DecimalPipe } from '@angular/common';

interface Scene {
  sceneNumber: number;
  description: string;
  visualPrompt: string;
  imageUrl?: string;
  isGenerating?: boolean;
  isRegeneratingText?: boolean;
  isEnhancingPrompt?: boolean;
  statusMessage?: string;
  errorMessage?: string; 
  promptHistory?: Array<{ prompt: string, imageUrl?: string }>;
  progress?: number;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

// Data shape for a single version
interface ProjectData {
  script: string;
  scenes: Scene[];
  aspectRatio: string;
  resolution: string;
  timestamp: number;
}

interface ProjectSnapshot {
  id: string;
  name: string;
  timestamp: number;
  data: ProjectData;
}

@Component({
  selector: 'app-root',
  imports: [DatePipe, DecimalPipe], // Import DecimalPipe for number formatting
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
  private geminiService = inject(GeminiService);
  private appRef = inject(ApplicationRef);

  // App State
  hasEntered = signal<boolean>(false);

  // Script State
  scriptText = signal<string>('');
  scenes = signal<Scene[]>([]);
  isAnalyzing = signal<boolean>(false);
  
  // Computed Properties
  wordCount = computed(() => {
    const text = this.scriptText().trim();
    return text ? text.split(/\s+/).length : 0;
  });
  
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

  // Versioning/History State
  projectHistory = signal<ProjectSnapshot[]>([]);
  isHistoryOpen = signal<boolean>(false);
  
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  constructor() {
    // Initialize Chat
    this.chatSession = this.geminiService.getChatModel();
    this.addBotMessage("Hello! I'm your Storyboard Assistant. How can I help you with your script today?");
  }

  // --- App Flow ---

  enterApp() {
    this.hasEntered.set(true);
    this.triggerUpdate();
  }

  // --- Script Management ---

  loadSampleScript() {
    const sample = `EXT. CYBERPUNK MARKET - NIGHT

Neon rain slicks the streets of Neo-Tokyo. Holographic advertisements for synthetic organs flicker above the crowds.

KAI (20s, cybernetic arm, street-smart) leans against a noodle stall, watching the entrance to the Arasaka Tower. He checks his wrist-comp.

KAI
(into comms)
I'm in position. The target is moving.

A black flying vehicle descends silently from the smog, landing on the roof.`;
    
    this.scriptText.set(sample);
    this.triggerUpdate();
    this.showNotification('Sample script loaded');
  }

  clearScript() {
    if (this.scriptText() && confirm('Are you sure you want to clear the current script?')) {
      this.scriptText.set('');
      this.triggerUpdate();
    }
  }

  // --- Persistence Logic ---

  saveProject() {
    // When saving manually, we also persist the history
    const data = {
      script: this.scriptText(),
      scenes: this.scenes(),
      aspectRatio: this.selectedAspectRatio(),
      resolution: this.selectedResolution(),
      chatHistory: this.chatMessages(),
      projectHistory: this.projectHistory() // Save the versions too
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
        
        // Restore current state
        if (data.script) this.scriptText.set(data.script);
        if (data.scenes) this.scenes.set(data.scenes);
        if (data.aspectRatio) this.selectedAspectRatio.set(data.aspectRatio);
        if (data.resolution) this.selectedResolution.set(data.resolution);
        if (data.chatHistory) this.chatMessages.set(data.chatHistory);
        
        // Restore history if it exists
        if (data.projectHistory) this.projectHistory.set(data.projectHistory);

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

  // --- Versioning / Snapshots ---

  toggleHistory() {
    this.isHistoryOpen.update(v => !v);
    this.triggerUpdate();
  }

  createSnapshot(customName?: string) {
    const timestamp = Date.now();
    const sceneCount = this.scenes().length;
    const name = customName || `Snapshot: ${sceneCount} Scenes`;

    const snapshotData: ProjectData = {
      script: this.scriptText(),
      scenes: JSON.parse(JSON.stringify(this.scenes())), // Deep copy
      aspectRatio: this.selectedAspectRatio(),
      resolution: this.selectedResolution(),
      timestamp
    };

    const newSnapshot: ProjectSnapshot = {
      id: crypto.randomUUID(),
      name,
      timestamp,
      data: snapshotData
    };

    // Add to history (newest first)
    this.projectHistory.update(history => [newSnapshot, ...history]);
    this.showNotification('Version snapshot created');
    
    // Auto-save to local storage so history persists
    this.saveProject();
  }

  restoreSnapshot(snapshot: ProjectSnapshot) {
    if (!confirm('Are you sure? This will overwrite your current workspace with this snapshot.')) return;

    const data = snapshot.data;
    this.scriptText.set(data.script);
    this.scenes.set(JSON.parse(JSON.stringify(data.scenes))); // Deep copy back
    this.selectedAspectRatio.set(data.aspectRatio);
    this.selectedResolution.set(data.resolution);
    
    this.isHistoryOpen.set(false);
    this.showNotification(`Restored version from ${new Date(snapshot.timestamp).toLocaleTimeString()}`);
    this.triggerUpdate();
  }

  deleteSnapshot(id: string, event: Event) {
    event.stopPropagation(); // Prevent triggering restore
    if (!confirm('Delete this snapshot?')) return;
    
    this.projectHistory.update(h => h.filter(s => s.id !== id));
    this.saveProject(); // Update storage
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

    // Auto-snapshot before major changes
    if (this.scenes().length > 0) {
      this.createSnapshot('Auto-save: Before Analysis');
    }

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
        promptHistory: [],
        progress: 0 
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

  updateScenePrompt(scene: Scene, event: Event) {
    const newPrompt = (event.target as HTMLTextAreaElement).value;
    if (scene.visualPrompt === newPrompt) return;

    // Save history
    const historyItem = { prompt: scene.visualPrompt, imageUrl: scene.imageUrl };
    
    this.updateSceneState(scene.sceneNumber, {
       visualPrompt: newPrompt,
       imageUrl: undefined, // Clear image as prompt changed/invalidated
       promptHistory: [...(scene.promptHistory || []), historyItem]
    });
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

    // Update specific scene state - Start
    this.updateSceneState(scene.sceneNumber, { 
      isGenerating: true, 
      statusMessage: 'Enhancing prompt...',
      progress: 10,
      errorMessage: undefined 
    });

    try {
      // 1. Enhance the prompt first
      const enhancedPrompt = await this.geminiService.enhancePrompt(scene.visualPrompt);
      
      this.updateSceneState(scene.sceneNumber, {
        progress: 40,
        statusMessage: 'Preparing render...'
      });

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
        progress: 60,
        ...historyUpdate
      });

      // 2. Generate the image
      // We append resolution here as a final bias
      const finalPrompt = `${enhancedPrompt}, ${this.selectedResolution()} resolution`;
      const imageUrl = await this.geminiService.generateImage(finalPrompt, this.selectedAspectRatio());
      
      this.updateSceneState(scene.sceneNumber, { 
        imageUrl, 
        isGenerating: false,
        statusMessage: undefined,
        progress: 100
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
        errorMessage: friendlyError,
        progress: 0
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
      imageUrl: previous.imageUrl, // Restore image if it exists in history
      promptHistory: newHistory,
      statusMessage: undefined,
      errorMessage: undefined,
      progress: 0
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