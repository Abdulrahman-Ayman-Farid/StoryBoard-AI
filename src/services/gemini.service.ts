import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env['API_KEY'] || '';
    this.ai = new GoogleGenAI({ apiKey });
  }

  async analyzeScript(script: string): Promise<any[]> {
    const model = 'gemini-2.5-flash';
    const prompt = `
      You are an expert storyboard artist and director. 
      Analyze the following script and break it down into a sequence of key visual scenes/shots for a storyboard.
      For each scene, provide:
      1. sceneNumber: An integer index.
      2. description: A brief description of the action.
      3. visualPrompt: A detailed, high-quality image generation prompt describing the visual composition, lighting, style, and subject matter. Optimise this prompt for a photorealistic or cinematic style.
      
      Return the response in strictly valid JSON format.
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: model,
        contents: [
          { role: 'user', parts: [{ text: prompt }] },
          { role: 'user', parts: [{ text: script }] }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sceneNumber: { type: Type.INTEGER },
                description: { type: Type.STRING },
                visualPrompt: { type: Type.STRING }
              }
            }
          }
        }
      });
      
      const jsonStr = response.text || '[]';
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error('Error analyzing script:', error);
      throw error;
    }
  }

  async regenerateScene(script: string, sceneNumber: number): Promise<{ description: string, visualPrompt: string }> {
    const model = 'gemini-2.5-flash';
    const prompt = `
      You are an expert storyboard artist.
      Refine and rewrite the details for Scene ${sceneNumber} based on the script provided below.
      Provide a NEW, improved description and a high-quality visual prompt. Try to make it distinct from a generic interpretation.
      
      Return the response in strictly valid JSON format.
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: model,
        contents: [
          { role: 'user', parts: [{ text: prompt }] },
          { role: 'user', parts: [{ text: script }] }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING },
              visualPrompt: { type: Type.STRING }
            }
          }
        }
      });

      const jsonStr = response.text || '{}';
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error('Error regenerating scene:', error);
      throw error;
    }
  }

  async generateImage(prompt: string, aspectRatio: string = '16:9'): Promise<string> {
    const model = 'imagen-4.0-generate-001';
    
    // Validate aspect ratio for the API (only specific ones allowed)
    // The UI might use 16:9, but API accepts '16:9'
    
    try {
      const response = await this.ai.models.generateImages({
        model: model,
        prompt: prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: aspectRatio as any, 
        }
      });

      const base64ImageBytes = response.generatedImages?.[0]?.image?.imageBytes;
      if (base64ImageBytes) {
        return `data:image/jpeg;base64,${base64ImageBytes}`;
      }
      throw new Error('No image generated');
    } catch (error) {
      console.error('Error generating image:', error);
      throw error;
    }
  }

  getChatModel() {
    return this.ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: "You are a helpful assistant integrated into a Storyboard AI application. You can help users write scripts, suggest visual styles, or answer questions about filmmaking."
      }
    });
  }
}