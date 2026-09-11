# Skill Feedback

Use only when the user wants to send skill feedback to its upstream maintainers. A request to review
or fix local instructions stays local. This reference concerns agent guidance, not Supabase product support.

## Steps

1. Draft a reviewable issue using [the template](../assets/feedback-issue-template.md). Identify the
   exact reference/section and distinguish local customizations from upstream guidance. Include only
   the minimum reproduction; omit project secrets, personal data and unrelated conversation.
2. Submit only with explicit authorization to send this feedback. Existing authorization persists;
   if missing, ask after the draft is ready, naming the destination and visible content.
3. Create the authorized issue in `supabase/agent-skills` with title `user-feedback: <summary>`.
   Share the resulting link. If submission fails, preserve the draft and provide
   [the upstream issue form](https://github.com/supabase/agent-skills/issues/new).
