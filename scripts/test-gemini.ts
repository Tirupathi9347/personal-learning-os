import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || '';

if (!apiKey) {
  console.error('Missing GEMINI_API_KEY in environment.');
  process.exit(1);
}

async function testWorkingModel() {
  const genAI = new GoogleGenerativeAI(apiKey);
  const models = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];

  for (const modelName of models) {
    try {
      console.log(`Testing model: ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent('Say hello from Personal Learning OS!');
      console.log(`🎉 SUCCESS with ${modelName}:`, result.response.text().trim());
      return modelName;
    } catch (err: any) {
      console.log(`❌ ${modelName} failed:`, err.message);
    }
  }
}

testWorkingModel();
