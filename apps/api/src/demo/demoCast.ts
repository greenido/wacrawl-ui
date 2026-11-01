/**
 * Who is in the demo archive and how they behave. All of it is invented.
 *
 * The names are long-dead scientists on purpose: nobody can mistake them for
 * somebody's real contacts. Phone numbers sit in the reserved 555-0xxx range and
 * LIDs in a made-up 900… block. Do not "improve" this with real data, ever.
 */

export type Shape = 'steady' | 'growing' | 'fading' | 'stopped' | 'arc';

export interface DirectPersona {
  name: string;
  /** Conversations per month at full activity. */
  sessions: number;
  shape: Shape;
  /** How long ago this chat began. */
  startMonthsAgo: number;
  /** For `stopped`: how long ago it went quiet. */
  stoppedMonthsAgo?: number;
  /** Average messages per conversation. */
  turns: number;
  /** Share of conversations I start. */
  initiates: number;
  /** Median minutes before they reply, and before I do. */
  reply: number;
  myReply: number;
  topics: TopicName[];
  /** Chance a conversation I start never gets an answer. */
  ghost?: number;
  nightOwl?: boolean;
  archived?: boolean;
  /** Also known by an `@lid`, so their group messages exercise the identity merge. */
  hasLid?: boolean;
}

export interface GroupPersona {
  name: string;
  sessions: number;
  shape: Shape;
  startMonthsAgo: number;
  stoppedMonthsAgo?: number;
  turns: number;
  /** Share of messages that are mine. */
  myShare: number;
  /** Roster size, not counting me. The busiest speakers come first. */
  members: number;
  /** How many of those members post at all; the rest are lurkers. */
  speakers: number;
  topics: TopicName[];
  /** Years ago the group was created, for the founding-year chart. */
  foundedYearsAgo: number;
  archived?: boolean;
}

export const SELF_NAME = 'Charles Babbage';

export const TOPICS = {
  climbing: ['crag', 'belay', 'harness', 'chalk', 'overhang', 'bouldering'],
  books: ['novel', 'chapter', 'library', 'paperback', 'author', 'bookmark'],
  cooking: ['sourdough', 'risotto', 'paprika', 'oven', 'recipe', 'lentils'],
  code: ['compiler', 'deploy', 'refactor', 'debugger', 'kernel', 'pipeline'],
  maths: ['theorem', 'proof', 'algebra', 'calculus', 'matrix', 'integral'],
  space: ['orbit', 'telescope', 'comet', 'rocket', 'eclipse', 'satellite'],
  travel: ['airport', 'itinerary', 'passport', 'ferry', 'hostel', 'luggage'],
  family: ['grandma', 'birthday', 'cousins', 'picnic', 'dinner', 'photos'],
  garden: ['tomatoes', 'compost', 'seedlings', 'greenhouse', 'roses', 'allotment'],
  football: ['match', 'referee', 'penalty', 'stadium', 'midfielder', 'kickoff'],
  music: ['concert', 'playlist', 'cello', 'rehearsal', 'vinyl', 'soundcheck'],
  work: ['meeting', 'deadline', 'roadmap', 'standup', 'invoice', 'quarterly'],
  health: ['marathon', 'physio', 'yoga', 'sleep', 'running', 'stretching'],
  home: ['plumber', 'landlord', 'paint', 'neighbours', 'boiler', 'skylight'],
} as const;

export type TopicName = keyof typeof TOPICS;

export const DIRECT_PERSONAS: DirectPersona[] = [
  { name: 'Ada Lovelace', sessions: 18, shape: 'steady', startMonthsAgo: 44, turns: 8, initiates: 0.55, reply: 6, myReply: 9, topics: ['maths', 'music', 'code'], hasLid: true },
  { name: 'Grace Hopper', sessions: 14, shape: 'steady', startMonthsAgo: 44, turns: 8, initiates: 0.4, reply: 15, myReply: 8, topics: ['code', 'work'], hasLid: true },
  { name: 'Katherine Johnson', sessions: 16, shape: 'growing', startMonthsAgo: 30, turns: 7, initiates: 0.35, reply: 12, myReply: 25, topics: ['space', 'maths'] },
  { name: 'Marie Curie', sessions: 12, shape: 'steady', startMonthsAgo: 44, turns: 6, initiates: 0.7, reply: 95, myReply: 12, topics: ['garden', 'family'], ghost: 0.25 },
  { name: 'Alan Turing', sessions: 14, shape: 'fading', startMonthsAgo: 44, turns: 7, initiates: 0.6, reply: 35, myReply: 20, topics: ['maths', 'health', 'code'], nightOwl: true },
  { name: 'Rosalind Franklin', sessions: 10, shape: 'stopped', startMonthsAgo: 40, stoppedMonthsAgo: 6, turns: 6, initiates: 0.5, reply: 40, myReply: 30, topics: ['travel', 'books'], archived: true },
  { name: 'Nikola Tesla', sessions: 14, shape: 'steady', startMonthsAgo: 38, turns: 5, initiates: 0.2, reply: 4, myReply: 180, topics: ['space', 'home'], nightOwl: true, hasLid: true },
  { name: 'Emmy Noether', sessions: 9, shape: 'growing', startMonthsAgo: 14, turns: 8, initiates: 0.45, reply: 20, myReply: 15, topics: ['maths', 'books'] },
  { name: 'Hedy Lamarr', sessions: 7, shape: 'steady', startMonthsAgo: 42, turns: 5, initiates: 0.5, reply: 60, myReply: 45, topics: ['music', 'travel'], archived: true },
  { name: 'Charles Darwin', sessions: 8, shape: 'fading', startMonthsAgo: 44, turns: 5, initiates: 0.75, reply: 400, myReply: 30, topics: ['garden', 'travel'], ghost: 0.45 },
  { name: 'Johannes Kepler', sessions: 6, shape: 'stopped', startMonthsAgo: 36, stoppedMonthsAgo: 9, turns: 5, initiates: 0.5, reply: 50, myReply: 40, topics: ['space'] },
  { name: 'Mary Somerville', sessions: 6, shape: 'steady', startMonthsAgo: 28, turns: 4, initiates: 0.3, reply: 25, myReply: 70, topics: ['books', 'space'] },
  { name: 'Michael Faraday', sessions: 5, shape: 'arc', startMonthsAgo: 34, turns: 5, initiates: 0.5, reply: 30, myReply: 30, topics: ['home', 'work'] },
  { name: 'Caroline Herschel', sessions: 5, shape: 'steady', startMonthsAgo: 8, turns: 5, initiates: 0.4, reply: 18, myReply: 22, topics: ['space', 'cooking'] },
  { name: 'Louis Pasteur', sessions: 4, shape: 'fading', startMonthsAgo: 40, turns: 4, initiates: 0.8, reply: 900, myReply: 50, topics: ['cooking', 'health'], ghost: 0.6 },
  { name: 'Sofia Kovalevskaya', sessions: 6, shape: 'steady', startMonthsAgo: 5, turns: 6, initiates: 0.5, reply: 14, myReply: 16, topics: ['maths', 'travel'] },
  { name: 'Blaise Pascal', sessions: 3, shape: 'stopped', startMonthsAgo: 30, stoppedMonthsAgo: 5, turns: 4, initiates: 0.6, reply: 90, myReply: 60, topics: ['maths', 'football'] },
  { name: 'Lise Meitner', sessions: 4, shape: 'steady', startMonthsAgo: 3, turns: 5, initiates: 0.6, reply: 22, myReply: 26, topics: ['travel', 'music'] },
  { name: 'Florence Nightingale', sessions: 4, shape: 'steady', startMonthsAgo: 24, turns: 4, initiates: 0.25, reply: 35, myReply: 110, topics: ['health', 'family'] },
  { name: 'Isaac Newton', sessions: 3, shape: 'steady', startMonthsAgo: 44, turns: 3, initiates: 0.85, reply: 1500, myReply: 60, topics: ['maths', 'garden'], ghost: 0.7, archived: true },
  { name: 'Joan Clarke', sessions: 3, shape: 'growing', startMonthsAgo: 12, turns: 5, initiates: 0.5, reply: 28, myReply: 28, topics: ['books', 'code'], nightOwl: true },
  { name: 'Dorothy Vaughan', sessions: 3, shape: 'steady', startMonthsAgo: 18, turns: 4, initiates: 0.4, reply: 40, myReply: 35, topics: ['work', 'cooking'] },
];

/** In group rosters and the address book, with no direct chat of their own. */
export const EXTRA_CONTACTS = [
  'Annie Easley', 'Leonhard Euler', 'Carl Gauss', 'Srinivasa Ramanujan', 'Galileo Galilei',
  'Mary Anning', 'Gregor Mendel', 'Dmitri Mendeleev', 'Maria Agnesi', 'Antoine Lavoisier',
  'Tycho Brahe', 'Robert Hooke', 'James Maxwell', 'Barbara McClintock', 'Henrietta Leavitt',
  'Chien-Shiung Wu', 'Niels Bohr', 'Paul Dirac', 'Pierre Fermat', 'Sophie Germain',
];

export const GROUP_PERSONAS: GroupPersona[] = [
  { name: 'Family Dinner Planning', sessions: 16, shape: 'steady', startMonthsAgo: 44, turns: 9, myShare: 0.3, members: 7, speakers: 6, topics: ['family', 'cooking'], foundedYearsAgo: 7 },
  { name: 'Climbing Crew', sessions: 12, shape: 'growing', startMonthsAgo: 36, turns: 9, myShare: 0.2, members: 14, speakers: 9, topics: ['climbing', 'travel', 'health'], foundedYearsAgo: 3 },
  { name: 'Book Club', sessions: 8, shape: 'steady', startMonthsAgo: 44, turns: 8, myShare: 0.18, members: 11, speakers: 7, topics: ['books'], foundedYearsAgo: 5 },
  { name: 'Neighbourhood Watch', sessions: 10, shape: 'steady', startMonthsAgo: 40, turns: 7, myShare: 0.03, members: 34, speakers: 9, topics: ['home', 'garden'], foundedYearsAgo: 4 },
  { name: 'Friday Football', sessions: 9, shape: 'steady', startMonthsAgo: 34, turns: 8, myShare: 0.12, members: 18, speakers: 12, topics: ['football'], foundedYearsAgo: 3 },
  { name: 'Office Coffee Run', sessions: 16, shape: 'steady', startMonthsAgo: 26, turns: 5, myShare: 0.25, members: 9, speakers: 8, topics: ['work', 'cooking'], foundedYearsAgo: 2, archived: true },
  { name: 'Allotment Society', sessions: 6, shape: 'steady', startMonthsAgo: 32, turns: 5, myShare: 0.08, members: 21, speakers: 6, topics: ['garden'], foundedYearsAgo: 6, archived: true },
  { name: 'Difference Engine Alumni', sessions: 10, shape: 'fading', startMonthsAgo: 44, turns: 6, myShare: 0.15, members: 25, speakers: 10, topics: ['code', 'work'], foundedYearsAgo: 8 },
  { name: 'Eclipse Road Trip', sessions: 18, shape: 'stopped', startMonthsAgo: 26, stoppedMonthsAgo: 13, turns: 10, myShare: 0.28, members: 6, speakers: 6, topics: ['travel', 'space'], foundedYearsAgo: 2 },
  { name: 'Wedding Planning', sessions: 14, shape: 'stopped', startMonthsAgo: 34, stoppedMonthsAgo: 20, turns: 9, myShare: 0.25, members: 8, speakers: 7, topics: ['family', 'music'], foundedYearsAgo: 3 },
  { name: 'Startup Ideas', sessions: 12, shape: 'stopped', startMonthsAgo: 42, stoppedMonthsAgo: 24, turns: 8, myShare: 0.35, members: 5, speakers: 5, topics: ['code', 'work'], foundedYearsAgo: 4 },
  { name: 'Old Flatmates', sessions: 5, shape: 'stopped', startMonthsAgo: 44, stoppedMonthsAgo: 8, turns: 5, myShare: 0.25, members: 4, speakers: 4, topics: ['home', 'music'], foundedYearsAgo: 8 },
  { name: 'Concert Tickets', sessions: 8, shape: 'stopped', startMonthsAgo: 18, stoppedMonthsAgo: 11, turns: 6, myShare: 0.2, members: 10, speakers: 6, topics: ['music'], foundedYearsAgo: 1, archived: true },
];

/** On the roster with nothing ever posted, which the graveyard reports separately. */
export const SILENT_GROUP = { name: 'School Reunion', members: 12, foundedYearsAgo: 2 };

/** Words only I lean on, so the Distinctive Words card has something to find. */
export const MY_TEMPLATES = [
  'honestly the {a} sounds great',
  'basically done with the {a}, will send it over',
  'definitely up for the {a} tomorrow',
  'honestly not sure about the {a} yet',
  'let me check the {a} and get back to you',
  'running late, the {a} took forever',
  'basically the {a} is sorted, what about the {b}?',
  'can you remind me about the {a} tomorrow?',
  'I reckon the {a} needs another look',
  'definitely agree on the {a}',
  'on my way, bringing the {a}',
  'sorry, just saw this. {a} works for me',
  'sounds good',
  'tomorrow works',
  'on my way',
  'will do, thanks',
];

export const THEIR_TEMPLATES = [
  'hey charles, did you see the {a}?',
  'thanks charles! the {a} was brilliant',
  'any news on the {a}?',
  'the {a} was amazing yesterday',
  'what do you think about the {a} and the {b}?',
  'charles are you coming to the {a} this weekend?',
  'just finished the {a}, wow',
  'can we talk about the {a} later?',
  'lovely, the {b} turned out really well',
  'wonderful news about the {a}',
  'so the {a} got moved to next week',
  'haha that {a} story is great',
  'thanks!',
  'lovely',
  'see you soon',
  'wonderful',
];

export const EMOJIS_MINE = ['😂', '🙏', '👍', '😅', '🤔'];
export const EMOJIS_THEIRS = ['😂', '❤️', '🔥', '🎉', '😊', '🙌', '😍', '👏', '🥳', '😮'];

export const CAPTIONS = ['look at this', 'from today', 'the view from here', 'this one is for you', 'finally got a decent shot'];

/** Every category in the link report gets at least one domain. */
export const LINK_TEMPLATES = [
  'https://www.youtube.com/watch?v={id}',
  'https://www.youtube.com/watch?v={id}',
  'https://vimeo.com/{id}',
  'https://www.reddit.com/r/space/comments/{id}',
  'https://x.com/example/status/{id}',
  'https://www.linkedin.com/posts/example-{id}',
  'https://www.nytimes.com/2026/example-{id}.html',
  'https://www.bbc.com/news/example-{id}',
  'https://www.theguardian.com/science/example-{id}',
  'https://www.amazon.com/dp/{id}',
  'https://www.etsy.com/listing/{id}',
  'https://open.spotify.com/track/{id}',
  'https://open.spotify.com/track/{id}',
  'https://bandcamp.com/track/{id}',
  'https://github.com/example/{id}',
  'https://github.com/example/{id}',
  'https://stackoverflow.com/questions/{id}',
  'https://en.wikipedia.org/wiki/Analytical_Engine',
  'https://en.wikipedia.org/wiki/Comet',
  'https://docs.google.com/document/d/{id}',
  'https://example.com/notes/{id}',
  'https://example.org/events/{id}',
];

export const LINK_INTROS = ['check this out', 'you will like this', 'this reminded me of you', 'read this', 'worth a look', 'saved this for you'];
