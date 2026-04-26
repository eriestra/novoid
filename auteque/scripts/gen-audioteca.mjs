#!/usr/bin/env node
// scripts/gen-audioteca.mjs
// Generates 8 museography-themed MP3s via ElevenLabs TTS (es-ES),
// uploads each to Convex storage, and prints the updated seed URLs.
//
// Requires in .env.local: ELEVENLABS_API_KEY, CONVEX_URL, PUBLISH_SECRET.

import { readFileSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';

// ── Env ───────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const { ELEVENLABS_API_KEY, CONVEX_URL, PUBLISH_SECRET } = env;
for (const [k, v] of Object.entries({ ELEVENLABS_API_KEY, CONVEX_URL, PUBLISH_SECRET })) {
  if (!v) { console.error(`Missing ${k} in .env.local`); process.exit(1); }
}

const MODEL_ID = 'eleven_multilingual_v2';
const convex = new ConvexHttpClient(CONVEX_URL);

// ── Paragraphs (es-ES, peninsular Spanish) ────────────────────
// Roles: host (narradora institucional), femaleSpeaker (ponente), maleSpeaker, podcaster.
const TRACKS = [
  {
    id: 't1', role: 'host',
    title: 'Bienvenida a la Audioteca',
    text:
      'Os damos la bienvenida a la Audioteca de EVE Museografía. ' +
      'Un espacio donde la voz acompaña al objeto, y el relato sostiene la mirada. ' +
      'Encontraréis aquí audioguías de nuestras salas, conferencias abiertas y conversaciones con profesionales del sector. ' +
      'Adelante, pulsad reproducir.'
  },
  {
    id: 't2', role: 'femaleSpeaker',
    title: 'La narrativa en la museografía contemporánea',
    text:
      'La museografía contemporánea no se limita a exhibir: articula un discurso. ' +
      'Cada vitrina, cada cartela, cada recorrido propone una lectura del mundo. ' +
      'En esta charla discutiremos cómo la narrativa museográfica ha desplazado el protagonismo del objeto único hacia la experiencia compartida del visitante.'
  },
  {
    id: 't3', role: 'host',
    title: 'Sala 4 · Arte prehispánico',
    text:
      'Os encontráis en la Sala 4, dedicada al arte prehispánico. ' +
      'Ante vosotros, piezas rescatadas del centro de México, piezas que hablan de cosmogonía, de ciclos, de equilibrio. ' +
      'Tomaos vuestro tiempo: la cerámica de la izquierda procede de Teotihuacán, y conserva el pigmento original tras casi dos milenios.'
  },
  {
    id: 't4', role: 'maleSpeaker',
    title: 'Diseño de experiencias inmersivas',
    text:
      'Diseñar una experiencia inmersiva no es recargar el espacio con estímulos. ' +
      'Es, al contrario, orquestar silencios, luz, escala y sonido, de modo que el visitante olvide que está en un museo ' +
      'y entre, por un instante, en otro tiempo. La inmersión no se impone: se ofrece.'
  },
  {
    id: 't5', role: 'podcaster',
    title: 'Conversación con Isabela Trejo',
    text:
      'Hola, bienvenidos al podcast de EVE. Hoy conversamos con Isabela Trejo, responsable de formación en nuestra institución. ' +
      'Isabela, llevas años impulsando programas de mediación cultural aquí. ' +
      '¿Cómo ha cambiado la relación entre el museo y su público en la última década?'
  },
  {
    id: 't6', role: 'host',
    title: 'Sala 7 · Colección textil',
    text:
      'Pasáis ahora a la Sala 7, dedicada a la colección textil. ' +
      'Aquí conviven piezas de los valles de Oaxaca, de Guatemala y de la sierra peruana. ' +
      'Observad el detalle del telar de cintura: cada trama sostiene una memoria, un clan, una lengua. ' +
      'Nada de lo que veis es decoración; todo es escritura.'
  },
  {
    id: 't7', role: 'femaleSpeaker',
    title: 'Iluminación museográfica',
    text:
      'La iluminación es el primer lenguaje del museo. ' +
      'Antes de que el visitante lea una cartela, la luz ya le ha contado qué mirar, cómo mirarlo y durante cuánto tiempo. ' +
      'En esta conferencia repasaremos tres principios básicos: dirección, temperatura y uniformidad, aplicados a la conservación y a la experiencia.'
  },
  {
    id: 't8', role: 'podcaster',
    title: 'Entrevista · Curaduría emergente',
    text:
      'Os damos la bienvenida a un nuevo episodio. Hoy hablamos de curaduría emergente, ' +
      'un término que a veces incomoda y otras entusiasma. ' +
      '¿Qué significa curar desde los márgenes, desde las nuevas generaciones, desde las prácticas no institucionales? Acompañadnos.'
  }
];

// ── Voice assignment ──────────────────────────────────────────
// Hardcoded premade voice IDs (usable without voices_read scope).
// eleven_multilingual_v2 renders es-ES prosody naturally regardless of voice origin.
const CAST = {
  host:          { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (warm female narrator)' },
  femaleSpeaker: { voice_id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda (clear female speaker)' },
  maleSpeaker:   { voice_id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (crisp male speaker)' },
  podcaster:     { voice_id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily (warm conversational female)' }
};

// ── TTS ───────────────────────────────────────────────────────
async function synthesize(voiceId, text) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true }
    })
  });
  if (!resp.ok) {
    throw new Error(`TTS failed (${resp.status}): ${await resp.text()}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

// ── Convex upload ─────────────────────────────────────────────
async function uploadMp3(name, buffer) {
  const uploadUrl = await convex.mutation('files:generateUploadUrl');
  const putResp = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/mpeg' },
    body: buffer
  });
  if (!putResp.ok) throw new Error(`Upload failed (${putResp.status}): ${await putResp.text()}`);
  const { storageId } = await putResp.json();
  await convex.mutation('files:save', {
    name, storageId, contentType: 'audio/mpeg', secret: PUBLISH_SECRET
  });
  return `/img/${name}`;
}

// ── Main ──────────────────────────────────────────────────────
(async () => {
  console.log('→ Cast:');
  for (const [role, v] of Object.entries(CAST)) {
    console.log(`   ${role.padEnd(15)} ${v.name} (${v.voice_id})`);
  }

  const FORCE = process.env.FORCE === '1';
  const urls = {};
  for (const track of TRACKS) {
    const name = `audioteca-${track.id}.mp3`;
    const existing = await convex.query('files:getUrl', { name });
    if (existing && !FORCE) {
      urls[track.id] = `/img/${name}`;
      console.log(`→ ${track.id} [cached] ${track.title}`);
      continue;
    }
    const voice = CAST[track.role];
    process.stdout.write(`→ ${track.id} [${track.role} · ${voice.name}] ${track.title}… `);
    const mp3 = await synthesize(voice.voice_id, track.text);
    const url = await uploadMp3(name, mp3);
    urls[track.id] = url;
    console.log(`${mp3.length} bytes → ${url}`);
  }

  console.log('\n✓ Done. Seed URLs to patch into src/app/audioteca.html:');
  for (const [id, url] of Object.entries(urls)) {
    console.log(`   ${id}: ${url}`);
  }
})().catch((err) => { console.error(err); process.exit(1); });
