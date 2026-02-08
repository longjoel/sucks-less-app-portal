const TOPICS = [
  "your energy",
  "your focus",
  "your patience",
  "your confidence",
  "your boundaries",
  "your rest",
  "your creativity",
  "your relationships",
  "your communication",
  "your priorities",
  "your stress",
  "your attention",
  "your routines",
  "your motivation",
  "your curiosity",
  "your gratitude",
  "your self-talk",
  "your momentum",
  "your courage",
  "your discipline",
  "your clarity",
  "your work",
  "your home life",
  "your friendships",
  "your health",
  "your expectations",
  "your progress",
  "your mindset"
] as const;

const STEMS = [
  "What is one small thing that could improve {topic} today?",
  "What challenged {topic} the most this week?",
  "Where did you notice growth in {topic} recently?",
  "What would future-you thank you for doing about {topic} today?",
  "What is one belief affecting {topic} right now?",
  "How has {topic} changed over the last month?",
  "What feels unresolved about {topic}?",
  "What helped {topic} most today?",
  "What drained {topic} today?",
  "What does " + "enough" + " look like for {topic} right now?",
  "What boundary could protect {topic} this week?",
  "What habit is helping {topic} and should be kept?",
  "What habit is hurting {topic} and should be changed?",
  "What conversation might improve {topic}?",
  "What are you avoiding that affects {topic}?",
  "What is one brave step you can take for {topic}?",
  "What would make {topic} feel lighter tomorrow?",
  "What did you learn about {topic} today?",
  "What are three words that describe {topic} right now?",
  "What support would strengthen {topic}?",
  "How would you coach a friend through {topic}?",
  "What are you proud of regarding {topic}?",
  "What would simplify {topic} this week?",
  "What does a realistic next step for {topic} look like?",
  "If you gave {topic} 10 focused minutes, what would you do first?"
] as const;

export const JOURNAL_PROMPT_BANK = TOPICS.flatMap((topic) =>
  STEMS.map((stem) => stem.replace("{topic}", topic))
);

if (JOURNAL_PROMPT_BANK.length !== 700) {
  throw new Error(`Expected 700 journal prompts, got ${JOURNAL_PROMPT_BANK.length}.`);
}
