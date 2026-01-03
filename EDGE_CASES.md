# Casino Card Game - Edge Cases & Implementation Tracking

## Current Status
**Last Working Version:** Features 1,3,4,5,9,10,11 working (live on Vercel)
**Date:** January 2, 2026
**Deployment:** Live at casino-card-game.vercel.app
**Testing:** 4 successful multiplayer games completed 2026-01-02

---

## CAPTURES - Multiple Cards (No Builds)

### ✅ IMPLEMENTED
- [ ] None yet

### 🔧 TO IMPLEMENT

#### 1. Capture Multiple Same-Rank Cards
**Description:** Player plays a card to capture all cards of same rank on table  
**Example 1:** Player plays 4♠ → captures all 4s on table (4♥, 4♦, 4♣)  
**Example 2:** Player plays K♠ → captures all Kings on table (K♥, K♦)

**Functions Affected:**
- `handleCapture()` - validate multiple same-rank selection
- `captureCards()` - process multiple cards
- `handleTableCardClick()` - allow multi-select

**Potential Breaks:**
- Single card captures
- Build captures
- Combination captures (e.g., 2+3 to make 5)

---

#### 2. Capture Multiple Combinations That Equal Hand Card
**Description:** Player captures ALL combinations on table that equal their card rank  
**Example:** Player has 9♠. Table has: 9♥, 2♠+7♦, 5♣+4♥ → Can capture ALL (9, 2+7, 5+4)  
**Note:** No standalone 9 required - any combination of 9s counts  
**Note:** Can include 3+ card combinations (e.g., 2+3+4 = 9)

**Functions Affected:**
- `handleCapture()` - validate all valid 9-combinations
- `findCapturableCombinations()` - find ALL combinations, not just selected
- Multi-card selection UI

**Potential Breaks:**
- Simple captures
- Build captures
- Existing combination logic

---

## BUILDS - Straight Builds (Single Value)

### ✅ IMPLEMENTED
- [x] Create build with hand card + table cards (e.g., 3+4 = Building 7s)
- [x] Increase existing build (add card to change value)
- [x] Multiple groups detected (4+4+A, 7+2 = Building 9s, not 18s)
- [x] Picture card validation (no J/Q/K in builds)
- [x] Max build value = 10

### 🔧 TO IMPLEMENT

#### 3. Player Creates Build → Captures It Next Turn
**Description:** Player 1 creates build, then captures it on their next turn  
**Example:** P1 has 3♠, 7♦. Plays 3♠ to 4♥ → Building 7s. Next turn: plays 7♦ to capture.

**Functions Affected:**
- Build ownership tracking
- Turn validation
- Capture build logic (already exists)

**Potential Breaks:**
- Build capture by opponent
- Build increase logic

**STATUS:** Partially implemented - need to test ownership

---

#### 4. Opponent Captures Player's Build
**Description:** Player 1 creates build, Player 2 captures it  
**Example:** P1: 3♠ to 4♥ → Building 7s. P2 has 7♣ → captures build

**Functions Affected:**
- Build ownership (should NOT block opponent from capturing)
- Capture validation

**Potential Breaks:**
- Own build capture
- Turn order

**STATUS:** Need to verify opponent can capture any build

---

#### 5. Opponent Increases Player's Build
**Description:** Player 1 creates build, Player 2 increases it  
**Example:** P1: 3+4 = Building 7s. P2 has 2♥, 9♠ → adds 2♥ → Building 9s. P2 captures next turn.

**STATUS:** ✅ WORKING - Confirmed in multiplayer testing 2026-01-02 (P1: 2+4=Building 6s, P2 added 2→Building 8s, captured with 8)

**Functions Affected:**
- `increaseBuild()` - allow any player to increase any build
- Build ownership transfer (new owner is increaser)
- Validation: increaser must have capture card in hand

**Potential Breaks:**
- Own build increase
- Capture validation

---

#### 6. Player 1 Creates Build → Player 2 Increases → Player 1 Captures
**Description:** P1 creates build, P2 increases, P1 has new value and captures  
**Example:** P1: 3+4 = Building 7s (has 7♥, 9♦ in hand). P2: adds 2 → Building 9s. P1 captures with 9♦.

**Functions Affected:**
- Build ownership rules
- Multiple players modifying same build
- Capture validation

**Potential Breaks:**
- Build state tracking
- Turn validation

---

#### 7. Add Table Card to Existing Build → Capture Combined Total
**Description:** Player combines table card + existing build → captures with sum  
**Example:** Table has A♠, Build of 7s (3+4). P2 has 8♥ → combines A+build → captures with 8 (1+3+4=8)

**Functions Affected:**
- `handleBuild()` - detect "add table card to build" vs. "increase build"
- New function: `addToBuild()` or extend `increaseBuild()`
- Capture validation

**Potential Breaks:**
- Standard build increase
- Table card selection
- Build value calculation

**STATUS:** Not implemented - complex new feature

---

#### 8. Ambiguous Build Declaration (Multiple Valid Values)
**Description:** When cards can form multiple build values, player must declare which  
**Example:** Player has 2♠, 2♥, 5♦, 10♣. Table: 3♥, 5♠, 10♦, Q♠  
Plays 2♠ to 3♥ and 5♠ → Could be Building 5s (2+3=5, 5) OR Building 10s (2+3+5=10)  
**Game must prompt:** "Building 5s or 10s?"

**Functions Affected:**
- `findValidBuildValues()` - detect multiple options
- New UI: Build value selector modal/prompt
- `handleBuild()` - wait for user selection

**Potential Breaks:**
- Simple build creation
- Build validation

**STATUS:** Partially implemented - detection works, need UI prompt

---

## SPECIAL BUILD RULES

### 🔧 TO IMPLEMENT

#### 9. Multiple-Group Builds Cannot Be Increased (Locked)
**Description:** If build has multiple groups equaling same value, it's locked  
**Example 1:** Build of 7s: [3+4, 7] → LOCKED (two groups of 7)  
**Example 2:** Build of 7s: [3+4, 5+2] → LOCKED (two groups of 7)  
**Cannot add card to change value - only capturable with 7**

**Functions Affected:**
- `increaseBuild()` - check if build is locked
- `canPartitionIntoGroups()` - determine if multiple groups exist
- UI: disable increase option for locked builds

**Potential Breaks:**
- Single-group build increase

**STATUS:** Detection logic exists, need lock enforcement

---

#### 10. Picture Cards Cannot Form Builds
**Description:** J, Q, K have no rank and cannot participate in builds  
**Example:** Cannot play K to anything to make a build

**Functions Affected:**
- `handleBuild()` - reject if selected cards include J/Q/K

**Potential Breaks:**
- Picture card captures (pairing only)

**STATUS:** ✅ Already implemented (rank > 10 check)

---

#### 11. Active Build Restrictions
**Description:** If player has an active build they created, they CANNOT trail  
**Note:** They CAN capture other cards before capturing their build  
**Note:** Only applies to builds they own, not opponent's builds

**Functions Affected:**
- `handleTrail()` - check if player has active build
- Build ownership tracking
- Trail button validation

**Potential Breaks:**
- Normal trail functionality
- Turn order

**STATUS:** Not implemented

---

## TESTING PROTOCOL

### For Each Feature Implementation:
1. **Map all affected functions** ✅
2. **Identify potential breaks** ✅
3. **Implement feature** 
4. **Run 3 full-round playtests** (play naturally, don't manufacture scenarios)
5. **If all pass:**
   - Save to `/active-working-versions/`
   - Git commit with clear message
   - Move to next feature
6. **If breaks occur:**
   - Fix break
   - Run 3 MORE full rounds
   - Repeat until clean

---

## IMPLEMENTATION PRIORITY

### Phase 1: Core Captures (Essential for MVP)
1. ✅ Capture multiple same-rank cards (#1)
2. ✅ Capture multiple combinations (#2)

### Phase 2: Build Rules (Essential for MVP)
3. ✅ Opponent can capture builds (#4)
4. ✅ Opponent can increase builds (#5)
5. Build ownership transfer (#6)
6. Multiple-group build locking (#9)
7. Active build trail restriction (#11)

### Phase 3: Advanced Features (Nice-to-Have)
8. Add table card to build (#7)
9. Ambiguous build declaration UI (#8)

---

## NOTES
- **Current baseline:** Features 1,3,4,5,9,10,11 working - deployed live on Vercel
- **Deployment:** https://casino-card-game.vercel.app
- **Fixed:** Trail to empty table (handle undefined tableCards as [])
- **Fixed:** Active build trail restriction (Feature #11)
- **Confirmed:** Feature #5 (opponent increases build) working in live multiplayer testing
- **Discovered:** Feature #9a bug - cannot add hand card to existing build (Build button highlights but doesn't work)
- **Known issue:** "Building 20s" instead of "Building 10s" when playing 10 to two 10s (additive bug) - deferred
- **Git repository:** `/Applications/joecode/casino-card-game`
