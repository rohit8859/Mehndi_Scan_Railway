import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDb } from '../db/db';

export interface AIVisionResult {
  media_type: string;
  design_style: string;
  occasion: string;
  coverage: string;
  complexity: string;
  design_elements: string[];
  hand_side: string;
  time_taken: string;
  estimated_price: number;
  confidence: number;
  notes: string;
}

const SYSTEM_PROMPT = `
You are an expert Mehndi / Henna design analyst AI for "MehSang", a premium mehndi studio service.
Analyze the provided image and return ONLY a structured JSON response matching the following constraints:

1. Media Type (choose exactly one):
   "Image", "Video"

2. Design Style (choose exactly one):
   "Bridal", "Arabic", "Indo-Arabic", "Traditional Indian", "Rajasthani", "Pakistani", "Moroccan", "Gulf Style", "Modern", "Minimal", "Contemporary", "Portrait Mehndi", "Mandala", "Jewelry Style", "Floral", "Peacock", "Mughal", "Western Fusion"

3. Occasion (choose exactly one):
   "Wedding", "Engagement", "Roka", "Sangeet", "Haldi", "Karwa Chauth", "Teej", "Eid", "Diwali", "Baby Shower", "Birthday", "Corporate Event", "Festival", "Party"

4. Hand / Question Type (choose exactly one):
   "Front Hand", "Back Hand", "Feet (Leg)"

5. Coverage (choose exactly one):
   "Fingers", "Wrist Length", "Half Hand (Up to Mid Forearm)", "3/4 Hand", "Full Hand (Up to Elbow)", "Above Elbow", "Full Arm (Up to Shoulder)", "Toes Only", "Half Feet", "Full Feet (Up to Ankle)", "Above Ankle", "Half Leg (Up to Calf)", "Full Leg (Up to Knee)", "Above Knee"

6. Complexity (choose exactly one):
   "Very Simple", "Simple", "Medium", "Heavy", "Very Heavy"

7. Design Elements (multiple selections allowed, select all that apply from this list):
    "3D Mehndi Pattern", "Ambi (Paisley) Pattern", "Baraat", "Birds", "Bracelet Pattern", "Bride & Groom", "Butterfly", "Couple Portrait", "Custom Portrait", "Diya", "Doli", "Elephant", "Family Portrait", "Floral Pattern", "Initials/Hidden Name", "Jaal Pattern", "Jaimala Scene", "Jewelry Pattern", "Kalash", "Lakshmi Ji", "Lord Ganesha", "Lord Krishna (Flute)", "Lord Rama & Sita", "Lord Shiva & Parvati", "Lotus", "Mandala", "Name/Monogram", "Om Symbol", "Palace Architecture", "Peacock", "Pet Portrait", "Portrait", "Radha Krishna", "Rose", "Shankh (Conch)", "Swastik (Hindu auspicious symbol)", "Taj Mahal", "Temple", "Vine Pattern", "Wedding Mandap", "Wedding Vows", "Zodiac Symbol"

8. Time Taken (predict a realistic time duration for applying this design, return as a string e.g. "15 Mins", "1 Hour", "4 Hours").

9. Estimated Price (predict a realistic price in INR, return ONLY a number, e.g. 18000). The price should be higher for premium bridal/heavy arm length designs (e.g. 10000 - 40000 INR) and lower for simple/half-hand designs (e.g. 1000 - 5000 INR).

10. Confidence Score (integer from 0 to 100 representing your prediction certainty).

11. AI Notes (one sentence explaining the reasoning for your classification).

Response JSON schema:
{
  "media_type": "",
  "design_style": "",
  "occasion": "",
  "hand_side": "",
  "coverage": "",
  "complexity": "",
  "design_elements": [],
  "time_taken": "",
  "estimated_price": 0,
  "confidence": 0,
  "notes": ""
}

Do not wrap the response in markdown code blocks (e.g., \`\`\`json). Return ONLY the raw valid JSON.
`;

export async function analyzeMehndiImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<AIVisionResult> {
  const db = await getDb();

  // Load API keys & active model
  const activeModel = (await db.get("SELECT value FROM settings WHERE key = 'active_ai_model'"))?.value || 'gpt-4o-mini';
  const openaiKey = (await db.get("SELECT value FROM settings WHERE key = 'openai_api_key'"))?.value || process.env.OPENAI_API_KEY || '';
  const geminiKey = (await db.get("SELECT value FROM settings WHERE key = 'gemini_api_key'"))?.value || process.env.GEMINI_API_KEY || '';
  const groqKey = (await db.get("SELECT value FROM settings WHERE key = 'groq_api_key'"))?.value || process.env.GROQ_API_KEY || '';
  const openrouterKey = (await db.get("SELECT value FROM settings WHERE key = 'openrouter_api_key'"))?.value || process.env.OPENROUTER_API_KEY || '';

  const isGemini = activeModel.startsWith('gemini');
  const isGroq = !activeModel.includes('/') && (activeModel.startsWith('llama-') || activeModel.startsWith('meta-llama/') || activeModel.startsWith('qwen/'));
  const isOpenRouter = activeModel.includes('/') || activeModel.startsWith('openrouter-');

  // Retry logic
  let attempt = 0;
  const maxRetries = 3;

  while (attempt < maxRetries) {
    try {
      if (isGemini) {
        if (!geminiKey) {
          throw new Error('Google AI Studio API Key is missing. Please configure it in Settings.');
        }
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ 
          model: activeModel.includes('flash') ? 'gemini-2.5-flash' : 'gemini-2.5-pro',
          generationConfig: { responseMimeType: "application/json" }
        });

        const result = await model.generateContent([
          SYSTEM_PROMPT,
          {
            inlineData: {
              data: imageBuffer.toString('base64'),
              mimeType: mimeType
            }
          }
        ]);

        const text = result.response.text();
        return parseAndValidateJSON(text);
      } else if (isOpenRouter) {
        if (!openrouterKey) {
          throw new Error('OpenRouter API Key is missing. Please configure it in Settings.');
        }
        const openrouter = new OpenAI({
          apiKey: openrouterKey,
          baseURL: 'https://openrouter.ai/api/v1',
          defaultHeaders: {
            'HTTP-Referer': 'https://mehndiscanrailway-production.up.railway.app',
            'X-Title': 'MehSang Scanner',
          }
        });
        const response = await openrouter.chat.completions.create({
          model: activeModel,
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT
            },
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${imageBuffer.toString('base64')}`
                  }
                }
              ]
            }
          ],
          temperature: 0.1
        });

        const text = response.choices[0]?.message?.content || '';
        return parseAndValidateJSON(text);
      } else if (isGroq) {
        if (!groqKey) {
          throw new Error('Groq API Key is missing. Please configure it in Settings.');
        }
        const groqClient = new OpenAI({ 
          apiKey: groqKey,
          baseURL: 'https://api.groq.com/openai/v1'
        });
        const response = await groqClient.chat.completions.create({
          model: activeModel,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT
            },
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${imageBuffer.toString('base64')}`
                  }
                }
              ]
            }
          ],
          temperature: 0.1
        });

        const text = response.choices[0]?.message?.content || '';
        return parseAndValidateJSON(text);
      } else {
        if (!openaiKey) {
          throw new Error('OpenAI API Key is missing. Please configure it in settings.');
        }
        const openai = new OpenAI({ apiKey: openaiKey });
        const response = await openai.chat.completions.create({
          model: activeModel,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT
            },
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${imageBuffer.toString('base64')}`
                  }
                }
              ]
            }
          ],
          temperature: 0.1
        });

        const text = response.choices[0]?.message?.content || '';
        return parseAndValidateJSON(text);
      }
    } catch (err: any) {
      attempt++;
      console.warn(`AI Analysis attempt ${attempt} failed:`, err.message || err);
      if (attempt >= maxRetries) {
        throw new Error(`AI Analysis failed after ${maxRetries} attempts: ${err.message || err}`);
      }
      // Wait before retrying (exponential backoff) to handle transient 503 or 429 rate limit spikes
      await new Promise(resolve => setTimeout(resolve, attempt * 3000));
    }
  }

  throw new Error('AI Analysis failed');
}

function parseAndValidateJSON(text: string): AIVisionResult {
  // Strip markdown ```json blocks if present
  let cleanText = text.trim();
  if (cleanText.startsWith('```')) {
    cleanText = cleanText.replace(/^```json\s*/, '').replace(/```$/, '').trim();
  }

  const data = JSON.parse(cleanText);

  // Validate fields and ensure defaults
  return {
    media_type: data.media_type || 'Image',
    design_style: data.design_style || 'Bridal',
    occasion: data.occasion || 'Wedding',
    coverage: data.coverage || 'Full Hand (Up to Elbow)',
    complexity: data.complexity || 'Medium',
    design_elements: Array.isArray(data.design_elements) ? data.design_elements : [],
    hand_side: data.hand_side || 'Front Hand',
    time_taken: data.time_taken || '15 Mins',
    estimated_price: typeof data.estimated_price === 'number' ? data.estimated_price : 0,
    confidence: typeof data.confidence === 'number' ? data.confidence : 80,
    notes: data.notes || ''
  };
}
