# Short Prompt Template

Use this prompt in a new AI chat:

```text
Work in C:\Users\carlo\code\Brainstorm\playloom-engine.
Follow AGENTS.md exactly.
Create a new game: <game-id> ("<Game Title>"), fully playable 2D single-player.
Run: npm run validate, npm run test, npm run smoke.
Update games/<game-id>/docs/README.md with controls and game loop.
```

Optional add-ons:
1. `Use generated assets/audio with npm run asset:gen where useful.`
2. `Do not modify existing games except shared engine improvements if necessary.`
