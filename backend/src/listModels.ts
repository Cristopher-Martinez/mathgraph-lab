import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  
  console.log("API Key present:", !!apiKey);
  console.log("API Key length:", apiKey?.length);
  
  if (!apiKey) {
    console.log("No API key found");
    return;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  
  try {
    console.log("Fetching available models...\n");
    
    // Try to list models using the API directly
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    
    console.log("Status:", response.status, response.statusText);
    
    const data: any = await response.json();
    
    if (data.models) {
      console.log("Available models:");
      data.models.forEach((model: any) => {
        console.log(`- ${model.name}`);
        if (model.supportedGenerationMethods) {
          console.log(`  Methods: ${model.supportedGenerationMethods.join(", ")}`);
        }
      });
    } else {
      console.log("Response:", JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

listModels();
