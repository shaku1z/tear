import { defineCollection, z } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// ---- Base docs schema (Starlight) ----
const docs = defineCollection({
	loader: docsLoader(),
	schema: docsSchema({
		extend: z.object({
			// Optional game-version tag on every page (e.g. "v0.9.2")
			gameVersion: z.string().optional(),
		}),
	}),
});

export const collections = { docs };
