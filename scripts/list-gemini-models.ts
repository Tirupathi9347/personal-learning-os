const apiKey = process.env.GEMINI_API_KEY || '';

if (!apiKey) {
  console.error('Missing GEMINI_API_KEY in environment.');
  process.exit(1);
}

async function listModels() {
  console.log('Querying Google Gemini API for available models...');
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await res.json();
    if (data.models) {
      console.log('✅ Available Models:');
      data.models.forEach((m: any) => {
        if (m.supportedGenerationMethods?.includes('generateContent')) {
          console.log(` - ${m.name.replace('models/', '')} (${m.displayName})`);
        }
      });
    } else {
      console.log('Response:', data);
    }
  } catch (err: any) {
    console.error('Error fetching models:', err.message);
  }
}

listModels();
