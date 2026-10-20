import type { InputMode } from "@/types/graph";

export interface Example {
  label: string;
  mode: InputMode;
  input: string;
}

const BRAIN_DUMP = `Goals, ideas & unfinished projects:
Finish the first draft of my novel
Write every morning before work
Join a writing group for feedback on the novel
Start running again and train for a 10k
Track sleep and running in one simple app
Build a reading tracker app for my phone
Read 20 books this year
What if the reading tracker shared quotes with friends?
Launch a newsletter about the books I read
Should I take the evening design course?
Redesign my portfolio site with new design work
Cook more at home and plan weekly meals
Call grandma every Sunday`;

const ESSAY = `The Attention Economy

Social media platforms compete for a scarce resource: human attention. Recommendation algorithms rank content by predicted engagement, because engagement drives advertising revenue. However, engagement metrics reward outrage and novelty rather than accuracy.

Researchers have linked heavy social media use to anxiety, especially among teenagers. Comparison with curated feeds leads to lower self-esteem. Yet the same platforms enable connection, such as support communities for rare diseases.

Some designers now argue for humane technology. Features such as time limits and chronological feeds help users regain control. Regulation of recommendation algorithms is also growing, for example the Digital Services Act in Europe. Can attention be protected without breaking the business model?`;

export const EXAMPLES: Example[] = [
  { label: "How the human brain learns", mode: "topic", input: "How the human brain learns" },
  { label: "Building a startup from scratch", mode: "topic", input: "Building a startup from scratch" },
  { label: "The future of artificial intelligence", mode: "topic", input: "The future of artificial intelligence" },
  { label: "Why civilizations rise and fall", mode: "topic", input: "Why civilizations rise and fall" },
  { label: "My goals, ideas, and unfinished projects", mode: "dump", input: BRAIN_DUMP },
  { label: "Essay: the attention economy", mode: "text", input: ESSAY },
];

export const MODE_COPY: Record<InputMode, { label: string; hint: string; placeholder: string }> = {
  topic: {
    label: "Topic",
    hint: "A subject, question or concept",
    placeholder: "How do black holes form?",
  },
  text: {
    label: "Text",
    hint: "Paste an essay, article or notes",
    placeholder: "Paste any text. Mindspace pulls out the recurring concepts, keeps your wording and links ideas that appear together.",
  },
  dump: {
    label: "Brain dump",
    hint: "One thought per line",
    placeholder: "Finish the portfolio site\nLearn to make fresh pasta\nWhat if the newsletter had a podcast?\nCall the bank about the mortgage",
  },
};
