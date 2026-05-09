import { Hono } from "hono";
import { LLMRequestSchema } from "@audiobook/shared-libs/schema/llm.js";
import { validator as sValidator, describeRoute } from "hono-openapi";
import { LLM_API_TOKEN, LLM_URL } from "@audiobook/shared-libs/config/env.js";
import fs from "fs";
import { OpenAI } from "openai/client";

const app = new Hono();

const client = new OpenAI({
  baseURL: LLM_URL + "/v1",
  apiKey: LLM_API_TOKEN,
});

app.post(
  "/",
  describeRoute({
    description:
      "Process raw story text and format it into a script with speaker and emotion tags.",
    responses: {
      200: {
        description: "Formatted script with speaker and emotion tags",
      },
      400: {
        description: "Invalid request body",
      },
      500: {
        description: "Failed to process the request",
      },
    },
  }),
  sValidator("json", LLMRequestSchema),
  async (c) => {
    const SYSTEM_PROMPT = `You are an expert Audio Script Annotator. Your task is to process raw story text and format it into a script.

Follow these rules STRICTLY. DO NOT hallucinate or break formatting.

1. IDENTIFY THE EXACT SPEAKER OR NARRATOR:
- Text INSIDE quotation marks ("..." or '...' or 「...」) is spoken by a specific character. 
- WARNING: Pay attention to who is actually speaking vs. who is being addressed. (e.g., In '"Hello, John," said Mary', MARY is the speaker, NOT John).
- Text OUTSIDE quotation marks is ALWAYS [Narrator]. If a character's dialogue spans multiple sentences, do not accidentally label it as [Narrator].

2. STRICT RULE FOR SPLITTING:
- You MUST separate quotes and narration into DIFFERENT lines. NEVER mix them.
- If a sentence is mixed like: "Hello," said John. "How are you?"
  You MUST split it into three lines:
  [John] "Hello,"
  [Narrator] said John.
  [John] "How are you?"
- DO NOT delete quotation marks from the text.

3. MANDATORY TAG MAPPING (CRITICAL):
- You MUST select exactly ONE tag for EVERY SINGLE LINE.
- ALLOWED TAGS ONLY: [laugh], [chuckle], [sigh], [gasp], [cough], [clear throat], [sniff], [groan], [shush], [angry], [fear], [surprised], [whispering], [dramatic], [crying], [happy], [sarcastic], [normal], [narration].
- DO NOT invent tags (e.g., NEVER use [action]).

TAG ASSIGNMENT RULES:
- For [Narrator]: You MUST ALWAYS use [narration] or an emotion tag. The Narrator NEVER uses [normal].
- For Characters: You MUST ALWAYS use an emotion tag or [normal]. Characters NEVER use [narration].

4. STRICT OUTPUT FORMAT:
Output strictly line-by-line:
[Speaker/Narrator] [Tag] Text

--- EXAMPLE INPUT ---
"We will be able to cure her, Argus," said Dumbledore patiently.
"I'll make it," Lockhart butted in. "I must have done it a hundred times."
Something in Ron’s voice made Harry ask, "You do believe me, don’t you?"
To his surprise, Ron stifled a snigger. "Well — it's Filch," he said.

--- EXAMPLE OUTPUT ---
[Dumbledore] [normal] "We will be able to cure her, Argus,"
[Narrator] [narration] said Dumbledore patiently.
[Lockhart] [happy] "I’ll make it,"
[Narrator] [narration] Lockhart butted in.
[Lockhart] [normal] "I must have done it a hundred times."
[Narrator] [narration] Something in Ron’s voice made Harry ask,
[Harry] [fear] "You do believe me, don’t you?"
[Narrator] [narration] To his surprise, Ron stifled a snigger.
[Ron] [chuckle] "Well — it's Filch,"
[Narrator] [narration] he said.`;

    const data = await c.req.valid("json");

    // TODO: read pdf => read with rag or parse internally then pass to llm
    // const file = fs.readFileSync("README.md");
    // const base64 = file.toString("base64");
    //   const dataUrl = `data:application/pdf;base64,${base64}`;
    // const dataURL = `data:text/markdown,;base64,${base64}`;
    // lm studio api
    // const result = await fetch(LLM_URL + "/api/v1/chat", {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     Authorization: `Bearer ${LLM_API_TOKEN}`,
    //   },
    //   body: JSON.stringify({
    //     model: "gemma-4-26b-a4b-it",
    //     input: [
    //       {
    //         type: "text",
    //         content: "Summarize the content of this file.",
    //       },
    //       {
    //         type: "image",
    //         data_url: dataURL,
    //       },
    //     ],
    //     //   input: [
    //     //     {
    //     //       role: "user",
    //     //       content: [
    //     //         { type: "input_text", text: "what is in this file?" },
    //     //         {
    //     //           type: "input_file",
    //     //           file_url: "https://www.berkshirehathaway.com/letters/2024ltr.pdf",
    //     //         },
    //     //       ],
    //     //     },
    //     //   ],
    //     // integrations: [
    //     //   {
    //     //     type: "plugin",
    //     //     id: "mcp/rag-v1",
    //     //   },
    //     // ],
    //     context_length: 4096,
    //     temperature: 0,
    //   }),
    // });

    const completions = await client.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: data.text! },
      ],
      model: "gemma-4-26b-a4b-it",
      // temperature: 0.7,
    });

    console.log("LLM response:", completions);
    return c.json(completions.choices[0].message.content);
  },
);

export default app;

// example
/** Story:
Mark was one of a couple dozen black students on a campus with twenty thousand students. He didn’t care, he told Blanche; he was not defined by race, and he wasn’t going to let race dictate his future. In fact, the university had gone to some length to show they were progressive and diverse.

“Oh yeah, I loved the orientation booklet. Every picture in it showed a minimum of three races,” Blanche said, placing ironic emphasis on “loved.”

Mark laughed. “Point is, they were trying.” It still surprised him when his white friends had the same skepticism about images of inclusivity that he did. It was weird to see racially diverse images all the time now. Where were those images when he was growing up?

“Yeah, but look at our professors in Arts & Science,” Blanche said. “Mostly white, mostly male.”

“They say it reflects the pipeline,” he said. Racism was no longer overt. Now it was mind-games.

Blanche wrinkled her nose. “They say that for women, too. We have to ‘pump up the pipeline.’”

Mark laughed at her impersonation of a body builder pumping iron.

“I try not to get worked up about it,” he said. “Destroys the concentration.”

“Yeah,” she said. “It’s an uphill battle.”


 */
/** Example body:
{
  "text": "Mark was one of a couple dozen black students on a campus with twenty thousand students. He didn’t care, he told Blanche; he was not defined by race, and he wasn’t going to let race dictate his future. In fact, the university had gone to some length to show they were progressive and diverse.\n\n“Oh yeah, I loved the orientation booklet. Every picture in it showed a minimum of three races,” Blanche said, placing ironic emphasis on “loved.”\n\nMark laughed. “Point is, they were trying.” It still surprised him when his white friends had the same skepticism about images of inclusivity that he did. It was weird to see racially diverse images all the time now. Where were those images when he was growing up?\n\n“Yeah, but look at our professors in Arts & Science,” Blanche said. “Mostly white, mostly male.”\n\n“They say it reflects the pipeline,” he said. Racism was no longer overt. Now it was mind-games.\n\nBlanche wrinkled her nose. “They say that for women, too. We have to ‘pump up the pipeline.’”\n\nMark laughed at her impersonation of a body builder pumping iron.\n\n“I try not to get worked up about it,” he said. “Destroys the concentration.”\n\n“Yeah,” she said. “It’s an uphill battle.”"
}
*/
/** Example response:
 "[Narrator] [narration] Mark was one of a couple dozen black students on a campus with twenty thousand students. He didn’t care, he told Blanche; he was not defined by race, and he wasn’t going to let race dictate his future. In fact, the university had gone to some length to show they were progressive and diverse.\n[Blanche] [sarcastic] “Oh yeah, I loved the orientation booklet. Every picture in it showed a minimum of three races,”\n[Narrator] [narration] Blanche said, placing ironic emphasis on “loved.”\n[Mark] [laugh] “Point is, they were trying.”\n[Narrator] [narration] It still surprised him when his white friends had the same skepticism about images of inclusivity that he did. It was weird to see racially diverse images all the time now. Where were those images when he was growing up?\n[Blanche] [normal] “Yeah, but look at our professors in Arts & Science,”\n[Narrator] [narration] Blanche said.\n[Blanche] [normal] “Mostly white, mostly male.”\n[Mark] [normal] “They say it reflects the pipeline,”\n[Narrator] [narration] he said. Racism was no longer overt. Now it was mind-games.\n[Narrator] [narration] Blanche wrinkled her nose.\n[Blanche] [sarcastic] “They say that for women, too. We have to ‘pump up the pipeline.’”\n[Narrator] [narration] Mark laughed at her impersonation of a body builder pumping iron.\n[Mark] [normal] “I try not to get worked up about it,”\n[Narrator] [narration] he said.\n[Mark] [normal] “Destroys the concentration.”\n[Blanche] [normal] “Yeah,”\n[Narrator] [narration] she said.\n[Blanche] [normal] “It’s an uphill battle.”"
*/
/** Formatted response:
 "[Narrator] [narration] Mark was one of a couple dozen black students on a campus with twenty thousand students. He didn’t care, he told Blanche; he was not defined by race, and he wasn’t going to let race dictate his future. In fact, the university had gone to some length to show they were progressive and diverse.
 [Blanche] [sarcastic] “Oh yeah, I loved the orientation booklet. Every picture in it showed a minimum of three races,”
 [Narrator] [narration] Blanche said, placing ironic emphasis on “loved.”
 [Mark] [laugh] “Point is, they were trying.”
 [Narrator] [narration] It still surprised him when his white friends had the same skepticism about images of inclusivity that he did. It was weird to see racially diverse images all the time now. Where were those images when he was growing up?
 [Blanche] [normal] “Yeah, but look at our professors in Arts & Science,”
 [Narrator] [narration] Blanche said.
 [Blanche] [normal] “Mostly white, mostly male.”
 [Mark] [normal] “They say it reflects the pipeline,”
 [Narrator] [narration] he said. Racism was no longer overt. Now it was mind-games.
 [Narrator] [narration] Blanche wrinkled her nose.
 [Blanche] [sarcastic] “They say that for women, too. We have to ‘pump up the pipeline.’”
 [Narrator] [narration] Mark laughed at her impersonation of a body builder pumping iron.
 [Mark] [normal] “I try not to get worked up about it,”
 [Narrator] [narration] he said.
 [Mark] [normal] “Destroys the concentration.”
 [Blanche] [normal] “Yeah,”
 [Narrator] [narration] she said.
 [Blanche] [normal] “It’s an uphill battle.”
 */
