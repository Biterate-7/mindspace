import type { Category, Relation } from "@/types/graph";

/**
 * Curated knowledge templates for common subjects. They give the local engine
 * something genuinely useful to say about popular topics; unfamiliar topics fall
 * back to the general-purpose frames in `topic.ts`.
 */

export interface TemplateNode {
  label: string;
  category: Category;
  notes: string;
  children?: TemplateNode[];
}

export interface TopicTemplate {
  id: string;
  /** Lower-case words or phrases. Phrases count double when matched. */
  keywords: string[];
  branches: TemplateNode[];
  links: Array<[from: string, to: string, relation: Relation]>;
}

const n = (label: string, category: Category, notes = "", children?: TemplateNode[]): TemplateNode => ({
  label,
  category,
  notes,
  children,
});

export const TOPIC_TEMPLATES: TopicTemplate[] = [
  {
    id: "brain-learning",
    keywords: ["brain", "learn", "learning", "memory", "neuroscience", "neuron", "cognition", "study", "studying", "remember", "mind"],
    branches: [
      n("Neuroplasticity", "process", "The brain physically rewires itself in response to experience.", [
        n("Synaptic strengthening", "process", "Neurons that fire together wire together: repeated activation strengthens a connection."),
        n("Myelination", "process", "Insulating sheaths form around heavily used pathways so signals travel faster."),
        n("Synaptic pruning", "process", "Unused connections are trimmed away, sharpening the circuits that matter."),
      ]),
      n("Memory systems", "concept", "Learning relies on several cooperating memory systems.", [
        n("Working memory", "concept", "A small mental workspace that holds roughly four chunks at once."),
        n("Hippocampus", "concept", "Binds new experiences into memories and indexes them for later recall."),
        n("Long-term consolidation", "process", "New memories stabilise and merge with existing knowledge over hours to days."),
        n("Procedural memory", "concept", "Skills and habits stored in motor circuits and the basal ganglia."),
      ]),
      n("Learning strategies", "process", "Evidence-based techniques that make knowledge stick.", [
        n("Spaced repetition", "process", "Reviewing at growing intervals counters the forgetting curve."),
        n("Retrieval practice", "process", "Pulling information out of memory strengthens it more than re-reading."),
        n("Interleaving", "process", "Mixing related topics improves discrimination and transfer."),
        n("Elaboration", "process", "Linking new ideas to existing knowledge creates more paths back to them."),
      ]),
      n("Brain state", "concept", "Biological conditions that gate how well we encode information.", [
        n("Sleep", "process", "Deep and REM sleep replay and consolidate the day's learning."),
        n("Attention", "concept", "What you attend to is what gets encoded."),
        n("Emotion and stress", "concept", "Moderate arousal sharpens memory; chronic stress impairs the hippocampus."),
        n("Curiosity and dopamine", "process", "Surprise and curiosity release dopamine, tagging information as worth keeping."),
      ]),
      n("Expertise", "impact", "With practice, knowledge reorganises into fast, automatic structures.", [
        n("Chunking", "process", "Experts compress many details into single meaningful patterns."),
        n("Deliberate practice", "process", "Focused effort at the edge of ability, with fast feedback."),
        n("Transfer", "impact", "Applying knowledge in a new context: the real test of understanding."),
      ]),
      n("Open questions", "question", "Things worth exploring further.", [
        n("Why do we forget so quickly?", "question", "Without review, most new information fades within days."),
        n("Can adults learn as fast as children?", "question", "Adult brains stay plastic, but learn differently."),
      ]),
    ],
    links: [
      ["Spaced repetition", "Long-term consolidation", "supports"],
      ["Retrieval practice", "Long-term consolidation", "supports"],
      ["Sleep", "Long-term consolidation", "supports"],
      ["Synaptic strengthening", "Long-term consolidation", "causes"],
      ["Emotion and stress", "Hippocampus", "causes"],
      ["Chunking", "Working memory", "supports"],
      ["Deliberate practice", "Myelination", "causes"],
      ["Curiosity and dopamine", "Attention", "supports"],
      ["Why do we forget so quickly?", "Spaced repetition", "related"],
    ],
  },
  {
    id: "startup",
    keywords: ["startup", "start-up", "company", "founder", "founding", "business", "entrepreneur", "entrepreneurship", "venture", "saas", "product"],
    branches: [
      n("Problem and insight", "concept", "Strong startups begin with a painful problem and a non-obvious insight.", [
        n("Customer discovery", "process", "Interview potential users to learn how they live with the problem today."),
        n("Unfair insight", "concept", "Something you understand about the market that others underestimate."),
        n("Market timing", "concept", "Why now? Shifts in technology, regulation or behaviour open new windows."),
      ]),
      n("Product", "process", "Build the smallest thing that delivers real value, then iterate.", [
        n("Minimum viable product", "example", "Tests the riskiest assumption as cheaply as possible."),
        n("Product–market fit", "impact", "Users pull the product from you and retention curves flatten."),
        n("Iteration loops", "process", "Ship, measure, learn. Short cycles compound."),
      ]),
      n("Team", "concept", "The early team sets the ceiling for everything else.", [
        n("Co-founders", "concept", "Complementary skills and deep trust; most splits come from misaligned expectations."),
        n("Early hires", "concept", "Generalists who thrive in ambiguity."),
        n("Culture", "concept", "What you reward early becomes the company's default behaviour."),
      ]),
      n("Go-to-market", "process", "How the product reaches and wins customers.", [
        n("Distribution channels", "process", "Content, sales, partnerships or virality; usually one channel dominates."),
        n("Pricing", "concept", "Price communicates value and decides who your customers are."),
        n("Early adopters", "example", "People with the most acute pain, willing to tolerate rough edges."),
      ]),
      n("Funding and runway", "concept", "Capital buys time to find what works.", [
        n("Bootstrapping", "example", "Funding growth from revenue keeps control but limits speed."),
        n("Venture capital", "example", "Trading equity for speed, with expectations of outsized growth."),
        n("Burn rate", "concept", "Monthly spend determines how many experiments you can afford."),
      ]),
      n("Failure modes", "impact", "Most startups die from a handful of predictable causes.", [
        n("Running out of cash", "impact", "The most common proximate cause of failure."),
        n("Building without users", "impact", "Polishing a product nobody asked for."),
        n("Founder burnout", "impact", "Unsustainable pace erodes judgment and relationships."),
      ]),
      n("Key questions", "question", "Questions to keep asking.", [
        n("What would make customers switch?", "question", "The status quo is the real competitor."),
        n("How will we know it is working?", "question", "Define the signal before you start measuring."),
      ]),
    ],
    links: [
      ["Customer discovery", "Minimum viable product", "supports"],
      ["Minimum viable product", "Product–market fit", "supports"],
      ["Early adopters", "Product–market fit", "supports"],
      ["Burn rate", "Running out of cash", "causes"],
      ["Building without users", "Customer discovery", "contrasts"],
      ["Venture capital", "Bootstrapping", "contrasts"],
      ["Pricing", "Distribution channels", "related"],
      ["Culture", "Founder burnout", "related"],
    ],
  },
  {
    id: "ai-future",
    keywords: ["ai", "artificial intelligence", "machine learning", "llm", "neural network", "agi", "automation", "robot", "robots", "deep learning", "chatbot", "intelligence"],
    branches: [
      n("Capabilities", "concept", "What AI systems can do keeps expanding across language, vision and reasoning.", [
        n("Large language models", "example", "Models trained on vast text that can write, summarise and reason."),
        n("Multimodal systems", "concept", "Models that see, hear and act, not only read and write."),
        n("AI agents", "concept", "Systems that plan and take multi-step actions toward a goal."),
        n("Scientific discovery", "example", "Protein structures, new materials and mathematics accelerated by AI."),
      ]),
      n("Drivers of progress", "process", "Forces that push capability forward.", [
        n("Compute scaling", "process", "More compute has reliably produced more capable models."),
        n("Training data", "concept", "Quality data, synthetic data and the limits of the open web."),
        n("Algorithmic advances", "process", "Better architectures and training methods multiply hardware gains."),
      ]),
      n("Work and economy", "impact", "AI reshapes which tasks people do and how value is created.", [
        n("Automation", "impact", "Routine cognitive tasks become cheap to perform at scale."),
        n("Augmentation", "impact", "Tools that make individuals dramatically more capable."),
        n("New industries", "impact", "Entirely new products and roles built on top of AI."),
      ]),
      n("Risks", "impact", "Ways the technology could cause harm.", [
        n("Misinformation", "impact", "Cheap, convincing synthetic media at scale."),
        n("Bias and fairness", "impact", "Models can reproduce and amplify patterns in their training data."),
        n("Loss of control", "impact", "Keeping increasingly capable systems aligned with human intent."),
        n("Concentration of power", "impact", "A few organisations controlling critical infrastructure."),
      ]),
      n("Governance", "process", "How societies steer the technology.", [
        n("Alignment research", "process", "Techniques for making AI systems reliably do what we intend."),
        n("Regulation", "process", "Rules on transparency, safety testing and accountability."),
        n("Open and closed models", "concept", "Tradeoffs between access, transparency and misuse."),
      ]),
      n("Open questions", "question", "Unresolved questions about where this goes.", [
        n("What remains uniquely human?", "question", "Judgment, taste, care and meaning may matter more, not less."),
        n("Could AI systems be conscious?", "question", "No scientific consensus on how we would even tell."),
      ]),
    ],
    links: [
      ["Compute scaling", "Large language models", "causes"],
      ["Training data", "Bias and fairness", "causes"],
      ["AI agents", "Automation", "causes"],
      ["Large language models", "Misinformation", "causes"],
      ["Augmentation", "Automation", "contrasts"],
      ["Alignment research", "Loss of control", "related"],
      ["Regulation", "Concentration of power", "related"],
      ["Scientific discovery", "New industries", "supports"],
    ],
  },
  {
    id: "civilizations",
    keywords: ["civilization", "civilisation", "empire", "empires", "history", "society", "societies", "collapse", "rise and fall", "ancient", "rome", "dynasty", "nation", "nations"],
    branches: [
      n("Foundations of rise", "concept", "Conditions that let complex societies emerge.", [
        n("Agricultural surplus", "process", "Food surpluses free people for specialised roles."),
        n("Geography", "concept", "Rivers, climate and natural defences shape early advantages."),
        n("Trade networks", "process", "Exchange spreads goods, ideas and technologies."),
      ]),
      n("Institutions", "concept", "Rules and organisations that coordinate millions of people.", [
        n("Rule of law", "concept", "Predictable rules that protect property and contracts."),
        n("Inclusive vs extractive institutions", "concept", "Whether power and wealth are broadly shared or captured by elites."),
        n("Bureaucracy", "process", "Administrative capacity to tax, record and govern at scale."),
      ]),
      n("Culture and ideas", "concept", "Shared ideas that bind and propel a society.", [
        n("Writing and records", "example", "Accumulated knowledge that outlives any single person."),
        n("Shared myths and religion", "concept", "Common stories let strangers cooperate."),
        n("Innovation", "process", "New tools and techniques compound across generations."),
      ]),
      n("Internal decline", "impact", "Pressures that build up from within.", [
        n("Overextension", "impact", "Growing beyond what can be defended and administered."),
        n("Inequality", "impact", "Concentrated wealth weakens social cohesion and legitimacy."),
        n("Environmental degradation", "impact", "Deforestation, soil exhaustion and water scarcity."),
        n("Elite overproduction", "impact", "More aspirants to power than positions, fuelling conflict."),
      ]),
      n("External shocks", "impact", "Events that hit societies from outside.", [
        n("Invasion", "example", "Military pressure from rivals or migrating peoples."),
        n("Pandemics", "example", "Disease spreading along the same routes as trade."),
        n("Climate shifts", "example", "Droughts and cooling periods that break food systems."),
      ]),
      n("Historical cases", "example", "Civilisations worth comparing.", [
        n("Roman Empire", "example", "Centuries of expansion followed by fiscal and military strain."),
        n("Classic Maya", "example", "Drought and warfare preceded the abandonment of great cities."),
        n("Han dynasty", "example", "Land concentration and court factions hollowed out central power."),
      ]),
      n("Big questions", "question", "Questions historians still debate.", [
        n("Is collapse inevitable?", "question", "Some societies transform rather than fall."),
        n("Are modern societies different?", "question", "Global interdependence adds both resilience and fragility."),
      ]),
    ],
    links: [
      ["Agricultural surplus", "Bureaucracy", "causes"],
      ["Trade networks", "Innovation", "supports"],
      ["Trade networks", "Pandemics", "causes"],
      ["Roman Empire", "Overextension", "example"],
      ["Classic Maya", "Environmental degradation", "example"],
      ["Inclusive vs extractive institutions", "Inequality", "causes"],
      ["Climate shifts", "Environmental degradation", "related"],
      ["Han dynasty", "Elite overproduction", "example"],
    ],
  },
  {
    id: "climate",
    keywords: ["climate", "climate change", "global warming", "carbon", "emissions", "sustainability", "environment", "renewable", "energy transition", "net zero"],
    branches: [
      n("Causes", "concept", "Human activity is adding heat-trapping gases to the atmosphere.", [
        n("Greenhouse gases", "concept", "CO₂, methane and nitrous oxide trap outgoing heat."),
        n("Fossil fuels", "process", "Burning coal, oil and gas is the largest source of emissions."),
        n("Deforestation", "process", "Clearing forests releases carbon and removes a natural sink."),
        n("Agriculture and methane", "process", "Livestock, rice and fertiliser add potent non-CO₂ gases."),
      ]),
      n("Effects", "impact", "Warming cascades through natural and human systems.", [
        n("Rising temperatures", "impact", "More frequent and intense heatwaves."),
        n("Sea level rise", "impact", "Thermal expansion and melting ice threaten coasts."),
        n("Extreme weather", "impact", "Heavier rainfall, longer droughts, stronger storms."),
        n("Biodiversity loss", "impact", "Species struggle to adapt to rapid change."),
      ]),
      n("Feedback loops", "process", "Warming can trigger further warming.", [
        n("Melting ice and albedo", "process", "Less ice means darker surfaces that absorb more heat."),
        n("Permafrost thaw", "process", "Frozen soils release stored carbon and methane."),
        n("Ocean warming", "process", "Warmer oceans absorb less CO₂ and fuel storms."),
      ]),
      n("Solutions", "process", "Ways to cut emissions and adapt.", [
        n("Renewable energy", "example", "Solar and wind are now the cheapest new power in most places."),
        n("Electrification", "process", "Moving transport and heating onto a clean grid."),
        n("Carbon removal", "process", "Forests, soils and engineered systems that pull CO₂ back out."),
        n("Adaptation", "process", "Preparing infrastructure and communities for unavoidable change."),
      ]),
      n("Policy and society", "concept", "Collective choices that shape the transition.", [
        n("Carbon pricing", "process", "Making emitters pay for the damage they cause."),
        n("International agreements", "concept", "Shared targets such as the Paris Agreement."),
        n("Climate justice", "concept", "Those least responsible are often most affected."),
      ]),
      n("Open questions", "question", "Where the debate continues.", [
        n("How fast can we decarbonise?", "question", "Speed depends on grids, materials and politics."),
        n("Who pays for adaptation?", "question", "Funding for vulnerable regions remains contested."),
      ]),
    ],
    links: [
      ["Fossil fuels", "Greenhouse gases", "causes"],
      ["Greenhouse gases", "Rising temperatures", "causes"],
      ["Rising temperatures", "Melting ice and albedo", "causes"],
      ["Melting ice and albedo", "Sea level rise", "causes"],
      ["Renewable energy", "Fossil fuels", "contrasts"],
      ["Carbon pricing", "Renewable energy", "supports"],
      ["Climate justice", "Who pays for adaptation?", "related"],
      ["Deforestation", "Biodiversity loss", "causes"],
    ],
  },
  {
    id: "space",
    keywords: ["space", "universe", "cosmos", "astronomy", "galaxy", "galaxies", "planet", "planets", "stars", "astrophysics", "mars", "nasa", "black hole", "cosmology", "solar system"],
    branches: [
      n("Cosmology", "concept", "The origin, structure and fate of the universe.", [
        n("Big Bang", "process", "The universe expanded from a hot, dense state 13.8 billion years ago."),
        n("Dark matter", "concept", "Invisible mass that holds galaxies together."),
        n("Dark energy", "concept", "A mysterious force accelerating cosmic expansion."),
        n("Cosmic microwave background", "example", "Faint afterglow light from the early universe."),
      ]),
      n("Stars and galaxies", "concept", "The luminous structures of the cosmos.", [
        n("Stellar life cycle", "process", "Stars form in nebulae, fuse elements and die as dwarfs, neutron stars or black holes."),
        n("Black holes", "concept", "Regions where gravity is so strong that not even light escapes."),
        n("Galaxy formation", "process", "Gas and dark matter clump into spirals and ellipticals over billions of years."),
      ]),
      n("Planets", "concept", "Worlds in our solar system and beyond.", [
        n("Exoplanets", "example", "Thousands of planets now confirmed around other stars."),
        n("Habitable zone", "concept", "Orbits where liquid water could exist on a surface."),
        n("Solar system", "example", "Rocky inner planets, gas giants and icy outer bodies."),
      ]),
      n("Exploration", "process", "How we observe and travel.", [
        n("Space telescopes", "example", "Instruments such as JWST that see deeper into time."),
        n("Robotic probes", "example", "Rovers and orbiters that explore where humans cannot yet go."),
        n("Human spaceflight", "process", "Living and working beyond Earth, from orbit to the Moon."),
      ]),
      n("Life in the universe", "question", "Are we alone?", [
        n("Astrobiology", "process", "Studying how life arises and where it could exist."),
        n("Fermi paradox", "question", "If life is common, why haven't we seen it?"),
      ]),
    ],
    links: [
      ["Big Bang", "Cosmic microwave background", "causes"],
      ["Dark matter", "Galaxy formation", "supports"],
      ["Stellar life cycle", "Black holes", "causes"],
      ["Space telescopes", "Exoplanets", "supports"],
      ["Habitable zone", "Astrobiology", "related"],
      ["Dark energy", "Dark matter", "contrasts"],
    ],
  },
  {
    id: "habits",
    keywords: ["habit", "habits", "productivity", "productive", "focus", "procrastination", "routine", "routines", "discipline", "time management", "motivation", "self-improvement"],
    branches: [
      n("Habit loop", "process", "Habits form through a repeating cycle.", [
        n("Cue", "concept", "A trigger that initiates the behaviour."),
        n("Craving", "concept", "The anticipated reward that motivates action."),
        n("Routine", "process", "The behaviour itself."),
        n("Reward", "concept", "The payoff that teaches the brain to repeat the loop."),
      ]),
      n("Environment design", "process", "Shape surroundings so good choices are easy.", [
        n("Reduce friction", "process", "Make desired actions the path of least resistance."),
        n("Smart defaults", "concept", "Pre-decide choices so willpower is not required."),
        n("Remove temptations", "process", "Increase friction for habits you want to break."),
      ]),
      n("Focus", "concept", "Protecting attention for meaningful work.", [
        n("Deep work", "process", "Long, uninterrupted sessions on cognitively demanding tasks."),
        n("Distractions", "impact", "Context switching quietly drains time and energy."),
        n("Time blocking", "process", "Scheduling work in dedicated blocks on the calendar."),
      ]),
      n("Motivation", "concept", "Why we start, and why we continue.", [
        n("Identity", "concept", "Lasting habits come from who you believe you are."),
        n("Small wins", "impact", "Visible progress builds momentum."),
        n("Intrinsic motivation", "concept", "Doing something for its own sake outlasts external rewards."),
      ]),
      n("Systems and review", "process", "Feedback loops that keep habits on course.", [
        n("Weekly review", "process", "Look back, adjust plans and clear open loops."),
        n("Habit tracking", "example", "A visible streak is its own reward."),
        n("Energy management", "concept", "Match tasks to your natural energy peaks."),
      ]),
      n("Questions", "question", "Things to reflect on.", [
        n("Why do my habits break?", "question", "Usually a missing cue or too much friction, not lack of willpower."),
      ]),
    ],
    links: [
      ["Reduce friction", "Routine", "supports"],
      ["Distractions", "Deep work", "contrasts"],
      ["Habit tracking", "Small wins", "supports"],
      ["Identity", "Intrinsic motivation", "related"],
      ["Time blocking", "Deep work", "supports"],
      ["Remove temptations", "Cue", "related"],
    ],
  },
  {
    id: "health",
    keywords: ["health", "healthy", "fitness", "exercise", "nutrition", "diet", "wellbeing", "well-being", "wellness", "longevity", "body", "aging", "ageing"],
    branches: [
      n("Movement", "process", "Regular physical activity is one of the strongest health levers.", [
        n("Strength training", "process", "Preserves muscle, bone density and metabolic health."),
        n("Cardio fitness", "process", "Aerobic capacity strongly predicts longevity."),
        n("Daily activity", "process", "Walking and moving throughout the day add up."),
      ]),
      n("Nutrition", "concept", "What and how you eat shapes energy and long-term risk.", [
        n("Whole foods", "example", "Minimally processed foods with fibre and micronutrients."),
        n("Protein", "concept", "Supports muscle repair and satiety."),
        n("Blood sugar", "concept", "Stable glucose supports energy and metabolic health."),
      ]),
      n("Sleep", "process", "Recovery for body and brain.", [
        n("Circadian rhythm", "process", "Consistent timing and morning light anchor the body clock."),
        n("Sleep quality", "concept", "Deep and REM stages restore different systems."),
      ]),
      n("Mental health", "concept", "Mind and body are tightly linked.", [
        n("Chronic stress", "impact", "Long-term stress affects immunity, sleep and the heart."),
        n("Social connection", "concept", "Strong relationships are linked to longer lives."),
        n("Purpose", "concept", "A sense of meaning supports resilience."),
      ]),
      n("Prevention", "process", "Catching problems early.", [
        n("Regular check-ups", "process", "Screening finds issues before symptoms appear."),
        n("Avoiding smoking and excess alcohol", "impact", "Among the largest modifiable risk factors."),
      ]),
      n("Questions", "question", "Things to explore.", [
        n("What is the minimum effective dose?", "question", "Small, consistent habits often beat ambitious plans."),
      ]),
    ],
    links: [
      ["Strength training", "Blood sugar", "supports"],
      ["Chronic stress", "Sleep quality", "causes"],
      ["Circadian rhythm", "Sleep quality", "supports"],
      ["Social connection", "Chronic stress", "contrasts"],
      ["Daily activity", "Cardio fitness", "supports"],
      ["Protein", "Strength training", "supports"],
    ],
  },
  {
    id: "finance",
    keywords: ["money", "finance", "financial", "invest", "investing", "investment", "budget", "budgeting", "wealth", "saving", "savings", "retirement", "debt", "personal finance"],
    branches: [
      n("Earning", "concept", "Income is the engine of every financial plan.", [
        n("Career capital", "concept", "Rare and valuable skills raise earning power."),
        n("Side income", "example", "Freelancing or small products diversify income."),
      ]),
      n("Spending and budgeting", "process", "Knowing where money goes.", [
        n("Budget", "process", "A plan that gives every unit of income a job."),
        n("Lifestyle inflation", "impact", "Spending rising with income erodes savings."),
        n("Emergency fund", "concept", "A cash buffer that turns crises into inconveniences."),
      ]),
      n("Investing", "process", "Putting money to work over long periods.", [
        n("Compound growth", "process", "Returns earning returns; time is the key ingredient."),
        n("Diversification", "concept", "Spreading money across assets reduces single points of failure."),
        n("Index funds", "example", "Low-cost funds that track a whole market."),
        n("Risk tolerance", "concept", "How much volatility you can live with without panic selling."),
      ]),
      n("Debt", "concept", "Borrowing moves future income into the present.", [
        n("High-interest debt", "impact", "Credit card balances compound against you."),
        n("Leverage", "concept", "Debt can amplify both gains and losses."),
      ]),
      n("Economy", "concept", "Forces beyond any individual's control.", [
        n("Inflation", "impact", "Rising prices reduce the value of cash over time."),
        n("Interest rates", "concept", "The price of money shapes borrowing and asset values."),
      ]),
      n("Questions", "question", "Things to think through, ideally with a qualified adviser.", [
        n("How much is enough?", "question", "Defining enough makes tradeoffs clearer."),
      ]),
    ],
    links: [
      ["Compound growth", "High-interest debt", "contrasts"],
      ["Inflation", "Emergency fund", "related"],
      ["Interest rates", "Leverage", "related"],
      ["Budget", "Emergency fund", "supports"],
      ["Lifestyle inflation", "Budget", "contrasts"],
      ["Index funds", "Diversification", "example"],
    ],
  },
  {
    id: "creativity",
    keywords: ["creativity", "creative", "writing", "write", "writer", "art", "artist", "novel", "story", "storytelling", "design", "painting", "craft", "inspiration"],
    branches: [
      n("Inputs", "concept", "Creativity recombines what you take in.", [
        n("Curiosity", "concept", "Following interest leads to unusual combinations."),
        n("Diverse influences", "example", "Ideas from other fields spark originality."),
        n("Constraints", "concept", "Limits force inventive solutions."),
      ]),
      n("Process", "process", "Creative work moves through recognisable phases.", [
        n("Divergent thinking", "process", "Generating many options without judging them."),
        n("Incubation", "process", "Stepping away lets the mind make connections."),
        n("Iteration", "process", "Drafting, testing and refining."),
        n("Editing", "process", "Cutting is where most quality comes from."),
      ]),
      n("Craft", "concept", "Skill that turns ideas into finished work.", [
        n("Voice and style", "concept", "A recognisable perspective that emerges with practice."),
        n("Structure", "concept", "The shape that guides an audience through the work."),
        n("Daily practice", "process", "Volume of work builds taste and skill."),
      ]),
      n("Blocks", "impact", "What stops people from making things.", [
        n("Perfectionism", "impact", "Waiting for perfect means never shipping."),
        n("Fear of judgment", "impact", "Worry about reception narrows experimentation."),
      ]),
      n("Sharing", "process", "Work becomes complete when others meet it.", [
        n("Feedback", "process", "Fresh eyes reveal what the creator cannot see."),
        n("Audience", "concept", "Knowing who it's for clarifies choices."),
        n("Publishing", "example", "Putting work into the world, regularly."),
      ]),
      n("Questions", "question", "Things to explore.", [
        n("What would I make if no one judged it?", "question", "A prompt for finding genuine interests."),
      ]),
    ],
    links: [
      ["Constraints", "Divergent thinking", "supports"],
      ["Perfectionism", "Publishing", "contrasts"],
      ["Daily practice", "Voice and style", "causes"],
      ["Feedback", "Iteration", "supports"],
      ["Incubation", "Curiosity", "related"],
      ["Fear of judgment", "Divergent thinking", "contrasts"],
    ],
  },
  {
    id: "music",
    keywords: ["music", "song", "songs", "songwriting", "melody", "rhythm", "harmony", "musician", "composing", "composition", "sound", "band", "album"],
    branches: [
      n("Elements", "concept", "The building blocks of music.", [
        n("Rhythm", "concept", "Patterns of time and pulse."),
        n("Melody", "concept", "A sequence of notes perceived as a single line."),
        n("Harmony", "concept", "Notes sounding together to create chords and tension."),
        n("Timbre", "concept", "The colour of a sound that distinguishes instruments."),
      ]),
      n("Emotion", "impact", "Why music moves us.", [
        n("Tension and release", "process", "Expectations built and resolved create feeling."),
        n("Memory and nostalgia", "impact", "Songs anchor moments in our lives."),
      ]),
      n("Making music", "process", "From idea to finished piece.", [
        n("Songwriting", "process", "Shaping melody, lyrics and structure."),
        n("Arrangement", "process", "Deciding which instruments play what, and when."),
        n("Production", "process", "Recording, mixing and shaping the final sound."),
      ]),
      n("Culture", "concept", "Music lives in communities.", [
        n("Genres", "example", "Shared conventions that evolve and blend."),
        n("Live performance", "example", "Collective experience between artist and audience."),
        n("Streaming", "impact", "Changed how music is discovered and paid for."),
      ]),
      n("Questions", "question", "Things to wonder about.", [
        n("Why do certain chords feel sad?", "question", "Part acoustics, part cultural learning."),
      ]),
    ],
    links: [
      ["Harmony", "Tension and release", "causes"],
      ["Rhythm", "Live performance", "supports"],
      ["Arrangement", "Timbre", "related"],
      ["Streaming", "Genres", "causes"],
    ],
  },
  {
    id: "social-media",
    keywords: ["social media", "internet", "online", "instagram", "tiktok", "twitter", "facebook", "youtube", "attention economy", "algorithm", "algorithms", "influencer", "creator economy"],
    branches: [
      n("Platforms", "concept", "Where online social life happens.", [
        n("Feeds", "concept", "Ranked streams that decide what each person sees."),
        n("Communities", "example", "Groups and forums around shared interests."),
        n("Messaging", "example", "Private and small-group conversation."),
      ]),
      n("Algorithms", "process", "Ranking systems optimise for engagement.", [
        n("Recommendation engines", "process", "Predict what will hold attention next."),
        n("Engagement metrics", "concept", "Likes, shares and watch time as proxies for value."),
      ]),
      n("Attention economy", "concept", "Attention is the scarce resource being competed for.", [
        n("Advertising model", "process", "Free services funded by selling attention."),
        n("Creators", "example", "Individuals building audiences and businesses."),
      ]),
      n("Effects", "impact", "Consequences for individuals and society.", [
        n("Connection", "impact", "Staying close to people and finding niche communities."),
        n("Polarisation", "impact", "Outrage spreads faster than nuance."),
        n("Mental health", "impact", "Comparison and compulsive use linked to anxiety."),
        n("Misinformation", "impact", "False claims can outrun corrections."),
      ]),
      n("Responses", "process", "Ways people and institutions push back.", [
        n("Digital wellbeing", "process", "Tools and habits for intentional use."),
        n("Platform regulation", "process", "Rules on data, transparency and child safety."),
      ]),
      n("Questions", "question", "Open debates.", [
        n("Who should decide what we see?", "question", "Platforms, users, or regulators?"),
      ]),
    ],
    links: [
      ["Engagement metrics", "Polarisation", "causes"],
      ["Recommendation engines", "Feeds", "supports"],
      ["Advertising model", "Engagement metrics", "causes"],
      ["Connection", "Mental health", "contrasts"],
      ["Platform regulation", "Misinformation", "related"],
      ["Digital wellbeing", "Mental health", "supports"],
    ],
  },
];
