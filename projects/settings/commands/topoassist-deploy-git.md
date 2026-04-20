Push TopoAssist changes to GitHub.

Steps:
1. Check for uncommitted changes:
   `git -C ~/claude status --short`
   If any tracked files are modified: report them and stop — commit first before pushing.

2. Check how many commits are ahead of remote:
   `git -C ~/claude rev-list --count origin/main..HEAD`
   If 0: report "✓ Already up to date — nothing to push." and stop.

3. Show what will be pushed:
   `git -C ~/claude log origin/main..HEAD --oneline`

4. Push to remote:
   `git -C ~/claude push`

5. Report results as a status block:
   - uncommitted: ✓ none  (or ✗ list modified files)
   - commits: N commits ahead of origin/main
   - push: ✓ pushed at <time>  (or ✗ error message)
