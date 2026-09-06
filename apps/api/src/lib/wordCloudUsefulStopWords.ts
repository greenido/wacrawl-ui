import { eng, heb } from 'stopword';

/** Messaging / link / attachment noise beyond standard English stopwords. */
const CHAT_TECH_URL_EXTRA = [
  // Tracking parameters. Every shared link carries them, so they outrank real
  // vocabulary in any chat where people paste articles: 'utm' and 'lid' were
  // the top two terms of a 43-message group.
  'fbclid',
  'gclid',
  'igsh',
  'lid',
  'mibextid',
  'utm',
  'apk',
  'asp',
  'au',
  'auth',
  'be',
  'bin',
  'bmp',
  'br',
  'ca',
  'caption',
  'captioned',
  'captioning',
  'cn',
  'co',
  'com',
  'de',
  'doc',
  'docx',
  'dmg',
  'epub',
  'exe',
  'facebook',
  'fr',
  'ftp',
  'gif',
  'gmail',
  'google',
  'htm',
  'html',
  'https',
  'http',
  'img',
  'instagram',
  'io',
  'it',
  'jp',
  'jpeg',
  'jpg',
  'mobi',
  'mov',
  'mp3',
  'mp4',
  'msg',
  'net',
  'nl',
  'omit',
  'omitted',
  'org',
  'pdf',
  'php',
  'png',
  'ppt',
  'pptx',
  'rar',
  'telegram',
  'tif',
  'tiff',
  'ttf',
  'twitter',
  'txt',
  'uk',
  'us',
  'vosotras',
  'vosotros',
  'wav',
  'webp',
  'webm',
  'webpage',
  'website',
  'whatsapp',
  'www',
  'xls',
  'xlsx',
  'youtu',
  'youtube',
  'zip',
];

/** Casual chat fillers not in `eng`. */
const CHAT_FILLER_EXTRA = ['btw', 'hello', 'hey', 'hi', 'hiya', 'hmm', 'idk', 'imo', 'lmao', 'lol', 'nope', 'okay', 'omg', 'pls', 'please', 'smh', 'thanx', 'thanks', 'thx', 'yep', 'yeah', 'yo'];

/** Porter “English” list gaps and other very common tokens (>=3 chars for our tokenizer). */
const EXTRA_EN_STOP = [
  'anything',
  'arent',
  'cant',
  'couldnt',
  'didnt',
  'does',
  'doesnt',
  'done',
  'dont',
  'every',
  'everything',
  'hadnt',
  'havent',
  'isnt',
  'lets',
  'nothing',
  'not',
  'nor',
  'no',
  'shall',
  'shouldnt',
  'something',
  'wasnt',
  'werent',
  'will',
  'wont',
  'wouldnt',
  'yes',
  'yet',
];

/**
 * Hebrew chat filler beyond the standard list.
 *
 * Hebrew glues its prepositions and conjunctions onto the following word
 * (ב/ל/מ/ו/ש/ה), so a stopword list can only catch the standalone forms;
 * stripping those prefixes needs a real morphological analyzer and is out of
 * scope here. These are the free-standing tokens that otherwise dominate.
 */
const CHAT_FILLER_EXTRA_HE = [
  'אבל', 'אוקיי', 'אולי', 'אותו', 'אותי', 'איזה', 'איך', 'אין', 'אלא', 'אנחנו',
  'אני', 'אתה', 'אתם', 'באמת', 'בבקשה', 'בסדר', 'בוקר', 'גם', 'הוא', 'היא',
  'היה', 'הם', 'זה', 'טוב', 'יום', 'יופי', 'יש', 'כבר', 'ככה', 'כן',
  'כמו', 'לא', 'להיות', 'לי', 'לך', 'מה', 'מתי', 'סבבה', 'עכשיו', 'על',
  'עם', 'פשוט', 'רק', 'שוב', 'שלום', 'שלי', 'שלך', 'תודה', 'תהיה', 'תוכל',
];

/**
 * Tokens dropped in "useful" word-cloud mode.
 *
 * Lowercased to match the tokenizer, which is a no-op for scripts without case.
 */
export const USEFUL_WORD_STOP_SET = new Set<string>([
  ...eng,
  ...heb,
  ...CHAT_TECH_URL_EXTRA,
  ...CHAT_FILLER_EXTRA,
  ...CHAT_FILLER_EXTRA_HE,
  ...EXTRA_EN_STOP,
]);
