import { Component, inject, signal, computed, ChangeDetectionStrategy, ElementRef, ViewChild, ApplicationRef } from '@angular/core';
import { GeminiService } from './services/gemini.service';
import { Chat, GenerateContentResponse } from '@google/genai';
import { DatePipe, DecimalPipe } from '@angular/common';

interface Scene {
  id: string; // Unique identifier for stable lookups
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
  notes?: string;
}

interface SceneGroup {
  id: string;
  name: string;
  isCollapsed: boolean;
  scenes: Scene[];
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

// Data shape for a single version
interface ProjectData {
  script: string;
  sceneGroups: SceneGroup[];
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
  imports: [DatePipe, DecimalPipe],
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
  
  // Replaced flat scenes with groups
  sceneGroups = signal<SceneGroup[]>([]);
  
  isAnalyzing = signal<boolean>(false);
  
  // Computed Properties
  wordCount = computed(() => {
    const text = this.scriptText().trim();
    return text ? text.split(/\s+/).length : 0;
  });

  totalSceneCount = computed(() => {
    return this.sceneGroups().reduce((acc, group) => acc + group.scenes.length, 0);
  });
  
  // Image Config
  selectedAspectRatio = signal<string>('16:9');
  selectedResolution = signal<string>('2K'); // 1K, 2K, 4K
  selectedGroupingStrategy = signal<string>('single'); // single, smart, batch_3, batch_5, batch_10

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
  draggedGroupIndex = signal<number | null>(null);
  draggedSceneIndex = signal<number | null>(null);
  dragOverGroupIndex = signal<number | null>(null);
  dragOverSceneIndex = signal<number | null>(null);

  // Versioning/History State
  projectHistory = signal<ProjectSnapshot[]>([]);
  isHistoryOpen = signal<boolean>(false);
  
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  constructor() {
    // Initialize Chat
    this.chatSession = this.geminiService.getChatModel();
    this.addBotMessage("Hello! I'm your Storyboard Assistant. How can I help you with your script today?");
  }

  // --- Chat Logic ---

  toggleChat() {
    this.isChatOpen.update(v => !v);
    this.triggerUpdate();
    if (this.isChatOpen()) {
      this.scrollToBottom();
    }
  }

  private addBotMessage(text: string) {
    this.chatMessages.update(msgs => [...msgs, { role: 'model', text }]);
    this.triggerUpdate();
    this.scrollToBottom();
  }

  async sendChatMessage() {
    const text = this.chatInput().trim();
    if (!text || !this.chatSession || this.isChatSending()) return;

    this.isChatSending.set(true);
    this.chatMessages.update(msgs => [...msgs, { role: 'user', text }]);
    this.chatInput.set('');
    this.triggerUpdate();
    this.scrollToBottom();

    try {
      const response = await this.chatSession.sendMessage({ message: text });
      this.addBotMessage(response.text || 'I could not generate a response.');
    } catch (err) {
      console.error('Chat error:', err);
      this.addBotMessage('Sorry, I encountered an error. Please try again.');
    } finally {
      this.isChatSending.set(false);
      this.triggerUpdate();
      this.scrollToBottom();
    }
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      }
    }, 100);
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
    const data = {
      script: this.scriptText(),
      sceneGroups: this.sceneGroups(),
      aspectRatio: this.selectedAspectRatio(),
      resolution: this.selectedResolution(),
      chatHistory: this.chatMessages(),
      projectHistory: this.projectHistory()
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
        
        if (data.script) this.scriptText.set(data.script);
        
        // Migration logic for old saves (flat scenes -> groups)
        if (data.scenes && Array.isArray(data.scenes) && !data.sceneGroups) {
          // Migration: Add IDs if missing
          const migratedScenes = data.scenes.map((s: any) => ({ ...s, id: s.id || crypto.randomUUID() }));
          
          const newGroup: SceneGroup = {
            id: crypto.randomUUID(),
            name: 'Sequence 01',
            isCollapsed: false,
            scenes: migratedScenes
          };
          this.sceneGroups.set([newGroup]);
        } else if (data.sceneGroups) {
          // Ensure imported scenes have IDs
          const groups = data.sceneGroups.map((g: any) => ({
             ...g,
             scenes: g.scenes.map((s: any) => ({ ...s, id: s.id || crypto.randomUUID() }))
          }));
          this.sceneGroups.set(groups);
        }

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

  // --- Group Management ---

  addNewGroup() {
    const newGroup: SceneGroup = {
      id: crypto.randomUUID(),
      name: `Act ${this.sceneGroups().length + 1}`,
      isCollapsed: false,
      scenes: []
    };
    this.sceneGroups.update(groups => [...groups, newGroup]);
    this.triggerUpdate();
  }

  deleteGroup(groupIndex: number) {
    if (confirm('Delete this section? All scenes inside will be removed.')) {
      this.sceneGroups.update(groups => groups.filter((_, i) => i !== groupIndex));
      this.triggerUpdate();
    }
  }

  toggleGroupCollapse(groupIndex: number) {
    this.sceneGroups.update(groups => 
      groups.map((g, i) => i === groupIndex ? { ...g, isCollapsed: !g.isCollapsed } : g)
    );
    this.triggerUpdate();
  }

  updateGroupName(groupIndex: number, event: Event) {
    const newName = (event.target as HTMLInputElement).value;
    this.sceneGroups.update(groups => 
      groups.map((g, i) => i === groupIndex ? { ...g, name: newName } : g)
    );
  }

  splitGroup(groupIndex: number, sceneIndex: number) {
    // Only split if not the first scene (makes no sense to create an empty group above)
    if (sceneIndex <= 0) return;

    this.sceneGroups.update(groups => {
      const currentGroups = [...groups];
      const sourceGroup = currentGroups[groupIndex];
      
      const scenesBefore = sourceGroup.scenes.slice(0, sceneIndex);
      const scenesAfter = sourceGroup.scenes.slice(sceneIndex);
      
      // Update current group
      currentGroups[groupIndex] = {
        ...sourceGroup,
        scenes: scenesBefore
      };
      
      // Create new group
      const newGroup: SceneGroup = {
        id: crypto.randomUUID(),
        name: `${sourceGroup.name} (Part 2)`,
        isCollapsed: false,
        scenes: scenesAfter
      };
      
      // Insert new group after
      currentGroups.splice(groupIndex + 1, 0, newGroup);
      
      return currentGroups;
    });
    this.showNotification('Section split successfully');
    this.triggerUpdate();
  }

  mergeWithPrevious(groupIndex: number) {
    if (groupIndex === 0) return;
    
    this.sceneGroups.update(groups => {
        const currentGroups = [...groups];
        const prevGroup = currentGroups[groupIndex - 1];
        const currGroup = currentGroups[groupIndex];
        
        // Merge scenes
        const mergedScenes = [...prevGroup.scenes, ...currGroup.scenes];
        
        // Update previous group
        currentGroups[groupIndex - 1] = {
            ...prevGroup,
            scenes: mergedScenes
        };
        
        // Remove current group
        currentGroups.splice(groupIndex, 1);
        
        return currentGroups;
    });
    this.showNotification('Sections merged');
    this.triggerUpdate();
  }

  // --- Versioning / Snapshots ---

  toggleHistory() {
    this.isHistoryOpen.update(v => !v);
    this.triggerUpdate();
  }

  createSnapshot(customName?: string) {
    const timestamp = Date.now();
    const sceneCount = this.totalSceneCount();
    const name = customName || `Snapshot: ${sceneCount} Scenes`;

    const snapshotData: ProjectData = {
      script: this.scriptText(),
      sceneGroups: JSON.parse(JSON.stringify(this.sceneGroups())), // Deep copy
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

    this.projectHistory.update(history => [newSnapshot, ...history]);
    this.showNotification('Version snapshot created');
    this.saveProject();
  }

  restoreSnapshot(snapshot: ProjectSnapshot) {
    if (!confirm('Are you sure? This will overwrite your current workspace with this snapshot.')) return;

    const data = snapshot.data;
    this.scriptText.set(data.script);
    
    if ((data as any).scenes && !(data as any).sceneGroups) {
          // Backward compatibility
          const scenes = (data as any).scenes.map((s: any) => ({ ...s, id: s.id || crypto.randomUUID() }));
          const newGroup: SceneGroup = {
            id: crypto.randomUUID(),
            name: 'Restored Sequence',
            isCollapsed: false,
            scenes
          };
          this.sceneGroups.set([newGroup]);
    } else {
        // Restore groups with fresh IDs if missing (sanity check)
        const groups = data.sceneGroups.map((g: any) => ({
             ...g,
             scenes: g.scenes.map((s: any) => ({ ...s, id: s.id || crypto.randomUUID() }))
        }));
        this.sceneGroups.set(groups);
    }

    this.selectedAspectRatio.set(data.aspectRatio);
    this.selectedResolution.set(data.resolution);
    
    this.isHistoryOpen.set(false);
    this.showNotification(`Restored version from ${new Date(snapshot.timestamp).toLocaleTimeString()}`);
    this.triggerUpdate();
  }

  deleteSnapshot(id: string, event: Event) {
    event.stopPropagation();
    if (!confirm('Delete this snapshot?')) return;
    this.projectHistory.update(h => h.filter(s => s.id !== id));
    this.saveProject();
  }

  // --- Drag and Drop Logic (Cross-Group) ---

  onDragStart(event: DragEvent, groupIndex: number, sceneIndex: number) {
    this.draggedGroupIndex.set(groupIndex);
    this.draggedSceneIndex.set(sceneIndex);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', JSON.stringify({ groupIndex, sceneIndex }));
    }
  }

  onDragOverScene(event: DragEvent, groupIndex: number, sceneIndex: number) {
    event.preventDefault(); 
    event.stopPropagation(); // Stop bubbling to group

    if (this.dragOverGroupIndex() !== groupIndex || this.dragOverSceneIndex() !== sceneIndex) {
      this.dragOverGroupIndex.set(groupIndex);
      this.dragOverSceneIndex.set(sceneIndex);
      this.triggerUpdate();
    }
    
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDragOverGroup(event: DragEvent, groupIndex: number) {
    event.preventDefault();
    // Only highlight group if we are not highlighting a specific scene
    if (this.dragOverGroupIndex() !== groupIndex || this.dragOverSceneIndex() !== null) {
      this.dragOverGroupIndex.set(groupIndex);
      this.dragOverSceneIndex.set(null); // Null means targeting the group (append)
      this.triggerUpdate();
    }
    
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDrop(event: DragEvent, targetGroupIndex: number, targetSceneIndex: number | null) {
    event.preventDefault();
    event.stopPropagation();
    const sourceGroupIndex = this.draggedGroupIndex();
    const sourceSceneIndex = this.draggedSceneIndex();
    
    if (sourceGroupIndex !== null && sourceSceneIndex !== null) {
      this.moveScene(sourceGroupIndex, sourceSceneIndex, targetGroupIndex, targetSceneIndex);
      this.showNotification(targetSceneIndex === null ? 'Scene moved to end of section' : 'Scene moved');
    }
    
    this.resetDragState();
  }
  
  onDragEnd(event: DragEvent) {
    this.resetDragState();
  }
  
  onDragLeave(event: DragEvent) {
    // Optional logic
  }

  private resetDragState() {
    this.draggedGroupIndex.set(null);
    this.draggedSceneIndex.set(null);
    this.dragOverGroupIndex.set(null);
    this.dragOverSceneIndex.set(null);
    this.triggerUpdate();
  }

  private moveScene(fromGroupIdx: number, fromSceneIdx: number, toGroupIdx: number, toSceneIdx: number | null) {
    const groups = JSON.parse(JSON.stringify(this.sceneGroups()));
    
    // 1. Remove from Source
    const [movedScene] = groups[fromGroupIdx].scenes.splice(fromSceneIdx, 1);
    
    // 2. Insert into Target
    if (toSceneIdx === null) {
        // Append to end of group
        groups[toGroupIdx].scenes.push(movedScene);
    } else {
        // Calculate insertion index
        let targetIndex = toSceneIdx;
        if (fromGroupIdx === toGroupIdx && fromSceneIdx < toSceneIdx) {
            targetIndex--;
        }
        
        groups[toGroupIdx].scenes.splice(targetIndex, 0, movedScene);
    }
    
    this.sceneGroups.set(groups);
  }

  // --- Storyboard Logic ---

  async analyzeScript() {
    if (!this.scriptText()) return;

    if (this.totalSceneCount() > 0) {
      this.createSnapshot('Auto-save: Before Analysis');
    }

    this.isAnalyzing.set(true);
    this.sceneGroups.set([]); 
    this.triggerUpdate();

    try {
      const strategy = this.selectedGroupingStrategy();
      const useSmart = strategy === 'smart';
      
      const result = await this.geminiService.analyzeScript(this.scriptText(), useSmart);
      
      const defaults = {
        isGenerating: false, 
        isRegeneratingText: false, 
        isEnhancingPrompt: false,
        statusMessage: '',
        errorMessage: undefined,
        promptHistory: [],
        progress: 0 
      };

      let newGroups: SceneGroup[] = [];

      if (useSmart) {
          // result is array of { name, scenes }
          newGroups = result.map((g: any) => ({
            id: crypto.randomUUID(),
            name: g.name || 'Untitled Sequence',
            isCollapsed: false,
            scenes: (g.scenes || []).map((s: any) => ({
                id: crypto.randomUUID(),
                ...s,
                ...defaults
            }))
          }));
      } else {
          // result is flat array of scenes
          const allScenes = result.map((s: any) => ({ 
            id: crypto.randomUUID(),
            ...s, 
            ...defaults
          }));

          if (strategy === 'single' || allScenes.length === 0) {
              newGroups = [{
                id: crypto.randomUUID(),
                name: 'Sequence 01',
                isCollapsed: false,
                scenes: allScenes
              }];
          } else if (strategy.startsWith('batch_')) {
              const size = parseInt(strategy.split('_')[1], 10) || 5;
              for (let i = 0; i < allScenes.length; i += size) {
                  const chunk = allScenes.slice(i, i + size);
                  newGroups.push({
                      id: crypto.randomUUID(),
                      name: `Sequence ${newGroups.length + 1}`,
                      isCollapsed: false,
                      scenes: chunk
                  });
              }
          }
      }
      
      this.sceneGroups.set(newGroups);
      this.generateAllImages();
      
    } catch (error) {
      this.showNotification('Failed to analyze script. Please check your API key or try again.');
      console.error(error);
    } finally {
      this.isAnalyzing.set(false);
      this.triggerUpdate();
    }
  }

  async regenerateSceneText(sceneId: string) {
    const { scene, groupIndex, sceneIndex } = this.findSceneById(sceneId);
    if (!scene || scene.isRegeneratingText || !this.scriptText()) return;

    this.updateScene(sceneId, { 
      isRegeneratingText: true, 
      errorMessage: undefined 
    });

    try {
      const result = await this.geminiService.regenerateScene(this.scriptText(), scene.sceneNumber);
      const historyItem = { prompt: scene.visualPrompt, imageUrl: scene.imageUrl };

      this.updateScene(sceneId, {
        description: result.description,
        visualPrompt: result.visualPrompt,
        imageUrl: undefined,
        isRegeneratingText: false,
        promptHistory: [...(scene.promptHistory || []), historyItem]
      });
    } catch (error) {
      console.error(error);
      this.updateScene(sceneId, { 
        isRegeneratingText: false,
        errorMessage: 'Text generation failed. Please try again.'
      });
    }
  }

  updateScenePrompt(sceneId: string, event: Event) {
    const { scene } = this.findSceneById(sceneId);
    if (!scene) return;
    
    const newPrompt = (event.target as HTMLTextAreaElement).value;
    if (scene.visualPrompt === newPrompt) return;

    const historyItem = { prompt: scene.visualPrompt, imageUrl: scene.imageUrl };
    
    this.updateScene(sceneId, {
       visualPrompt: newPrompt,
       imageUrl: undefined, 
       promptHistory: [...(scene.promptHistory || []), historyItem]
    });
  }

  async enhancePromptForScene(sceneId: string) {
    const { scene } = this.findSceneById(sceneId);
    if (!scene || scene.isEnhancingPrompt || scene.isGenerating) return;

    this.updateScene(sceneId, { 
      isEnhancingPrompt: true,
      errorMessage: undefined 
    });

    try {
      const enhancedPrompt = await this.geminiService.enhancePrompt(scene.visualPrompt);
      
      if (enhancedPrompt !== scene.visualPrompt) {
         const historyItem = { prompt: scene.visualPrompt, imageUrl: scene.imageUrl };
         this.updateScene(sceneId, {
           visualPrompt: enhancedPrompt,
           isEnhancingPrompt: false,
           promptHistory: [...(scene.promptHistory || []), historyItem]
         });
         this.showNotification('Prompt enhanced');
      } else {
         this.updateScene(sceneId, { isEnhancingPrompt: false });
         this.showNotification('Prompt is already optimized');
      }
    } catch (error) {
      console.error(error);
      this.updateScene(sceneId, { 
        isEnhancingPrompt: false,
        errorMessage: 'Prompt enhancement failed.'
      });
    }
  }

  async generateImageForScene(sceneId: string) {
    const { scene } = this.findSceneById(sceneId);
    if (!scene || scene.isGenerating) return;

    this.updateScene(sceneId, { 
      isGenerating: true, 
      statusMessage: 'Enhancing prompt...',
      progress: 10,
      errorMessage: undefined 
    });

    try {
      const enhancedPrompt = await this.geminiService.enhancePrompt(scene.visualPrompt);
      
      this.updateScene(sceneId, {
        progress: 40,
        statusMessage: 'Preparing render...'
      });

      let historyUpdate = {};
      if (enhancedPrompt !== scene.visualPrompt) {
         const historyItem = { prompt: scene.visualPrompt, imageUrl: scene.imageUrl };
         historyUpdate = { promptHistory: [...(scene.promptHistory || []), historyItem] };
      }
      
      this.updateScene(sceneId, { 
        visualPrompt: enhancedPrompt,
        statusMessage: 'Rendering image...',
        progress: 60,
        ...historyUpdate
      });

      const finalPrompt = `${enhancedPrompt}, ${this.selectedResolution()} resolution`;
      const imageUrl = await this.geminiService.generateImage(finalPrompt, this.selectedAspectRatio());
      
      this.updateScene(sceneId, { 
        imageUrl, 
        isGenerating: false,
        statusMessage: undefined,
        progress: 100
      });

    } catch (error: any) {
      console.error('Image Generation Error:', error);
      let friendlyError = 'Image generation failed.';
      if (error.message?.includes('429')) friendlyError = 'Usage limit exceeded.';
      else if (error.message?.includes('safety')) friendlyError = 'Blocked by safety settings.';
      else friendlyError = 'Connection interrupted.';

      this.updateScene(sceneId, { 
        isGenerating: false,
        statusMessage: 'Failed',
        errorMessage: friendlyError,
        progress: 0
      });
    }
  }

  async generateAllImages() {
    const groups = this.sceneGroups();
    for (const group of groups) {
      for (const scene of group.scenes) {
        if (!scene.imageUrl && !scene.isGenerating) {
          // Pass ID instead of indices
          await this.generateImageForScene(scene.id);
        }
      }
    }
  }

  revertToPreviousVersion(sceneId: string) {
    const { scene } = this.findSceneById(sceneId);
    if (!scene || !scene.promptHistory || scene.promptHistory.length === 0) return;
    
    const previous = scene.promptHistory[scene.promptHistory.length - 1];
    const newHistory = scene.promptHistory.slice(0, -1);
    
    this.updateScene(sceneId, {
      visualPrompt: previous.prompt,
      imageUrl: previous.imageUrl,
      promptHistory: newHistory,
      statusMessage: undefined,
      errorMessage: undefined,
      progress: 0
    });
  }

  updateSceneNotes(sceneId: string, event: Event) {
    const val = (event.target as HTMLTextAreaElement).value;
    this.updateScene(sceneId, { notes: val });
  }

  // --- Helpers ---

  // Update scene by ID (Cross-Group robust)
  private updateScene(sceneId: string, updates: Partial<Scene>) {
    this.sceneGroups.update(groups => {
      // Create shallow copy of groups array
      const newGroups = [...groups];
      
      for (let g = 0; g < newGroups.length; g++) {
        const group = newGroups[g];
        const sceneIndex = group.scenes.findIndex(s => s.id === sceneId);
        
        if (sceneIndex !== -1) {
           // Found it. Clone scenes array
           const newScenes = [...group.scenes];
           newScenes[sceneIndex] = { ...newScenes[sceneIndex], ...updates };
           newGroups[g] = { ...group, scenes: newScenes };
           break; // Stop once found
        }
      }
      return newGroups;
    });
    this.triggerUpdate();
  }

  private findSceneById(id: string): { scene: Scene | undefined, groupIndex: number, sceneIndex: number } {
    const groups = this.sceneGroups();
    for (let g = 0; g < groups.length; g++) {
      const idx = groups[g].scenes.findIndex(s => s.id === id);
      if (idx !== -1) {
        return { scene: groups[g].scenes[idx], groupIndex: g, sceneIndex: idx };
      }
    }
    return { scene: undefined, groupIndex: -1, sceneIndex: -1 };
  }

  onScriptInput(event: Event) {
    const val = (event.target as HTMLTextAreaElement).value;
    this.scriptText.set(val);
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

  onGroupingStrategyChange(event: Event) {
    const val = (event.target as HTMLSelectElement).value;
    this.selectedGroupingStrategy.set(val);
    this.triggerUpdate();
  }
  
  onChatInput(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.chatInput.set(val);
    this.triggerUpdate();
  }

  private triggerUpdate() {
    setTimeout(() => {
      this.appRef.tick();
    }, 0);
  }
}