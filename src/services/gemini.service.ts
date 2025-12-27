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

  async analyzeScript(script: string, useSmartGrouping: boolean = false): Promise<any[]> {
    const model = 'gemini-2.5-flash';
    
    if (useSmartGrouping) {
        const prompt = `
          You are an expert storyboard artist and director.
          Analyze the following script and break it down into logical narrative sequences or acts.
          For each sequence, provide a name (e.g., "Introduction", "The Chase", "Climax") and a list of key visual scenes/shots.
          
          For each scene, provide:
          1. sceneNumber: An integer index (global or relative).
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
                    name: { type: Type.STRING, description: "Name of the narrative sequence" },
                    scenes: {
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
                }
              }
            }
          });
          const jsonStr = response.text || '[]';
          return JSON.parse(jsonStr);
        } catch (error) {
          console.error('Error analyzing script (Smart):', error);
          throw error;
        }

    } else {
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
          console.error('Error analyzing script (Flat):', error);
          throw error;
        }
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

  async enhancePrompt(originalPrompt: string): Promise<string> {
    const model = 'gemini-2.5-flash';
    const prompt = `
      You are a professional visual prompt engineer for high-end AI image generators (like Imagen 3, Midjourney).
      Enhance the following scene description into a sophisticated, highly detailed image generation prompt.
      
      Input Description: "${originalPrompt}"
      
      Instructions:
      1. Improve the description of lighting (e.g., volumetric, cinematic, chiaroscuro, golden hour).
      2. Specify camera details (e.g., 35mm, wide angle, depth of field, bokeh).
      3. Add artistic style keywords (e.g., hyperrealistic, 8k, masterpiece, unreal engine 5 render, highly detailed).
      4. Ensure the subject and action remain clear and central.
      5. Output ONLY the enhanced prompt string. Do not add quotes or markdown.
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: model,
        contents: prompt,
      });
      return response.text.trim();
    } catch (error) {
      console.warn('Prompt enhancement failed, using original.', error);
      return originalPrompt;
    }
  }

  async generateImage(prompt: string, aspectRatio: string = '16:9'): Promise<string> {
    const model = 'imagen-4.0-generate-001';
    
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