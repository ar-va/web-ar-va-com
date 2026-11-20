# Trust principles for anon.ar-va.com

Why the front page looks and reads the way it does. Written 2026-11-17 from research on self-disclosure, trust and
privacy behaviour, and from what went wrong at other anonymous messaging apps. Keep new features consistent with it.

## What the research says

**Anonymity makes people say more, especially the hard things.** In an experiment with four mock apps, anonymity raised
how much people disclosed overall, and the effect was strongest for negative content
([Ma, Hancock & Naaman, CHI 2016](https://sml.stanford.edu/publications/2016/anonymity-intimacy-and-self-disclosure-social-media)).
So this site will receive heavy messages, not only fun ones. That brings a duty of care.

**Writing it down can help, a little.** Across 146 randomized studies, disclosing difficult experiences in writing had a
small positive effect on wellbeing ([Frattaroli 2006](https://Www.Gwern.net/doc/psychology/2006-frattaroli.pdf)).
Small, so the site must not present itself as help in a crisis.

**Over-reassurance backfires.** Long or repeated confidentiality promises can signal danger and do not reliably raise
willingness to respond ([Singer, Hippler & Schwarz 1992](https://scilit.com/publications/10519cc7dbd23ceb05300e3ef5330966)).
Priming privacy worries also lowers disclosure
([John, Acquisti & Loewenstein 2011](https://www.cmu.edu/dietrich/sds/docs/loewenstein/StrangersPlane.pdf)). State
the facts once, plainly, near the decision, rather than a wall of padlocks and "100% anonymous" badges.

**A polished look is not trustworthiness.** The same study found people disclosed *more* on an unprofessional-looking
site, which is more likely to misuse data. Looks persuade whether or not they are earned, so trust has to rest on
things that can be checked.

**Control makes people share more, sometimes too much.** Giving people more control over publishing lowered their
privacy concern and raised what they revealed, even about who else could see it
([Brandimarte, Acquisti & Loewenstein 2013](https://www.cmu.edu/dietrich/sds/docs/loewenstein/MisplacedConfidence.pdf)).
The "make it public" choice must come with the real risk shown at the moment of choosing.

**People copy what others disclose.** Willingness to admit sensitive things rises when others appear to have done so
([Acquisti, John & Loewenstein 2012](https://www.heinz.cmu.edu/~acquisti/papers/AcquistiJohnLoewenstein-JMR-2012.pdf)).
That makes fake activity a powerful lever, and therefore off limits.

**Credibility comes from verifiability and a real person.** The Stanford web credibility guidelines, built from studies
with over 4,500 people, put "make it easy to verify" and "show there's a real organization (person) behind it" first
([credibility.stanford.edu](https://credibility.stanford.edu/guidelines)). Trust research generally splits trust into
ability, benevolence and integrity: can they keep my secret, do they mean well, do they keep their word.

## What went wrong elsewhere

| App | What happened | Lesson |
| --- | --- | --- |
| NGL | Sent fake messages to drive engagement and sold a subscription that claimed to reveal senders; settled with the FTC in 2024 for $5 million and a ban on serving minors ([NBC](https://www.nbcnews.com/tech/tech-news/ftc-bans-anonymous-messaging-app-ngl-for-minors-rcna160897), [FTC](https://www.ftc.gov/NGL)) | Never fabricate messages; never sell or tease unmasking |
| Sendit | FTC complaint (2025): phony messages presented as from friends, a $9.99 a week "reveal who sent it" membership that didn't reveal senders ([FTC](https://www.ftc.gov/news-events/news/press-releases/2025/09/ftc-alleges-sendit-app-its-ceo-unlawfully-collected-personal-data-children-deceived-users-about)) | Same; no hidden payments |
| Whisper | Called itself the safest place on the internet; the Guardian reported in 2014 that it tracked users who had opted out of location ([Engadget](https://www.engadget.com/2014-10-17-whisper-app-shares-location.html)) | Claim only what the code does; let people check |
| Yik Yak | 2022: the app exposed users' precise GPS location with every post ([Vice](https://www.vice.com/en/article/anonymous-social-media-app-yik-yak-exposed-users-precise-locations)) | Don't collect what you don't need, so it can't leak |
| Sarahah | 2017: quietly uploaded users' address books ([The Intercept](https://theintercept.com/2017/08/27/hit-app-sarahah-quietly-uploads-your-address-book/)) | No hidden collection |
| Ask.fm | Anonymous questions were used for bullying; after a 14-year-old's suicide in 2013 it added reporting and moderation ([TechCrunch](https://techcrunch.com/?p=863530)) | Moderate before publishing; rules on what won't be published |

The pattern: trust collapses when people discover a gap between what an anonymous app promised and what it did.

## Principles and where they show on the page

1. **A real person, in their own words** (benevolence). Artur's photo and one promise next to the headline: "I read
   every message myself. I can't see who wrote it, and I won't try to find out."
2. **Concrete receipt, said once** (avoid over-reassurance). Three lines near the form: what reaches me (your words and
   the date), what doesn't (name, email, account, IP), and how to check. Details live in the FAQ, folded.
3. **Verifiable, not just claimed** (integrity). The code is public and deployed from GitHub; the page links to it
   ("Don't take my word for it"), and the FAQ says how.
4. **Name the one honest limit** (two-sided messages are more credible than absolute ones). Under the text box: "Your
   words are the only thing that can give you away." The old line "Nobody will know it was you, including me"
   overclaimed and was removed.
5. **Risk at the moment of choice** (control paradox). Picking "Ask to make it public" shows what publishing means:
   anyone can read it word for word, people who know you might recognize your writing, and it can be undone.
6. **Private by default, public by request, published after reading** (ask.fm). Unchanged from the first version.
7. **Welcome every kind of message** (lower evaluation fear). "Kind or critical, both are welcome", and optional starters
   for a blank page that mix thanks, confession, disagreement and a question.
8. **Real numbers or none** (relative standards). The answered list is only real messages; the empty state says there
   are no made-up examples. Response time is shown only from real data and only after 5 answered messages.
9. **No tricks, said out loud** (NGL, Sendit). No fake messages, no "see who sent this", no notifications pulling people
   back, nothing to pay for. Listed under "What I promise".
10. **Duty of care.** A quiet line under the form pointing to free, confidential helplines
    ([findahelpline.com](https://findahelpline.com/)): an anonymous inbox is not crisis help.
11. **House rules.** What won't be published (anything naming or exposing someone else, threats, cruelty), so writers
    know their words won't sit next to abuse and readers know the space is looked after.
12. **No pressure.** No timers, no counters urging people on, a calm character count, "Take your time. Nothing is sent
    until you press the button."

## Never add

Fake or seeded messages; "who sent this" hints or paid reveals; streaks, nudges or notifications to bring people
back; tracking or analytics scripts; security badges standing in for facts; any contact field (it would be a thread
back to the writer); claims the code doesn't back up.
