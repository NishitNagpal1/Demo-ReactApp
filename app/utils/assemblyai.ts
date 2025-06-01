import Constants from 'expo-constants';

const ASSEMBLY_AI_API_KEY =
  Constants.expoConfig?.extra?.ASSEMBLY_AI_API_KEY ||
  Constants.manifest?.extra?.ASSEMBLY_AI_API_KEY;

if (!ASSEMBLY_AI_API_KEY) {
  throw new Error('AssemblyAI API key is missing. Check your app.json or env setup.');
}

export async function transcribeWithAssemblyAI(audioUri: string): Promise<string> {
  // 1. Upload audio to AssemblyAI
  const audioData = await fetch(audioUri);
  const audioBlob = await audioData.blob();

  const uploadRes = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: {
      "authorization": ASSEMBLY_AI_API_KEY,
    },
    body: audioBlob,
  });
  const uploadJson = await uploadRes.json();
  const audioUrl = uploadJson.upload_url;

  // 2. Request transcription
  const transcriptRes = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: {
      "authorization": ASSEMBLY_AI_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      speech_model: "universal",
    }),
  });
  const transcriptJson = await transcriptRes.json();
  const transcriptId = transcriptJson.id;

  // 3. Poll for completion
  let status = transcriptJson.status;
  let transcriptText = "";
  while (status !== "completed" && status !== "error") {
    await new Promise((res) => setTimeout(res, 3000));
    const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: { "authorization": ASSEMBLY_AI_API_KEY },
    });
    const pollJson = await pollRes.json();
    status = pollJson.status;
    transcriptText = pollJson.text;
  }

  if (status === "completed") {
    return transcriptText;
  } else {
    throw new Error("Transcription failed");
  }
}