# Token Usage System for AI Agent

## Requirements

Create a comprehensive token usage system that:
1. **Tracks token consumption** for every agent action (thinking, planning, moving, using skills, etc.)
2. **Monthly reset + Pay-as-you-go** model for token allocation
3. **4 pricing tiers** with different token allocations (Free, Basic, Pro, Ultra)
4. **Block agent actions** when user ran out of credits.

##To-dos

Use this to do list for plan implement 
1. Explore codebase: pricing plans, agent actions, user auth, database schema
2. Create database table for token usage tracking
3. Create token configuration with costs per action and limits per plan
4. Create API routes for token usage tracking and retrieval
5. Integrate token deduction into all agent action API routes
6. Build profile/token usage UI component
7. Integrate profile UI into agent main page
8. Test and verify the full flow
