/** Does the brief ask for a picture as the deliverable? (verb + picture noun, and not a request to write code or text ABOUT a picture) */
const MAKE_PICTURE = /\b(generate|create|make|draw|design|produce|paint|illustrate|render|photograph|sketch)\b[^.\n]{0,50}\b(image|picture|photo|photograph|logo|illustration|icon|banner|poster|artwork|drawing|painting|thumbnail|wallpaper|avatar|infographic|graphic)s?\b/i;
const ABOUT_A_PICTURE = /\b(function|code|script|caption|alt text|describe|description|prompt|css|html|svg|component|api)\b/i;

export const looksLikePictureJob = (request: string) => MAKE_PICTURE.test(request) && !ABOUT_A_PICTURE.test(request);
