export const HORROR_MODULE = {
  "id": "horror",
  "name": "Horror Expert",
  "traits": [
    "horror",
    "scary",
    "creepy",
    "gore",
    "unsettling",
    "paranoia"
  ],
  "cards": [
    {
      "id": "higurashi",
      "titles": [
        "Higurashi: When They Cry"
      ],
      "domain": "rural psychological horror",
      "signature": "Cute rural slice-of-life that curdles into paranoia, violence, loops, and dread.",
      "vibes": {
        "horror": 10,
        "psychological": 8,
        "dark": 8,
        "mystery": 8
      },
      "viewerMotivations": [
        "paranoia",
        "mystery",
        "time loops",
        "violent horror"
      ],
      "idealFollowUps": [
        "shiki",
        "another",
        "summertime-rendering"
      ]
    },
    {
      "id": "shiki",
      "titles": [
        "Shiki"
      ],
      "domain": "vampire village horror",
      "signature": "A slow village horror story where the real terror is how quickly morality collapses.",
      "vibes": {
        "horror": 9,
        "dark": 8,
        "psychological": 7,
        "mystery": 6
      },
      "viewerMotivations": [
        "vampires",
        "slow dread",
        "moral collapse",
        "rural horror"
      ],
      "idealFollowUps": [
        "higurashi",
        "another",
        "monster"
      ]
    },
    {
      "id": "another",
      "titles": [
        "Another"
      ],
      "domain": "school curse horror",
      "signature": "A school curse mystery with ominous atmosphere and infamous horror set pieces.",
      "vibes": {
        "horror": 8,
        "mystery": 7,
        "dark": 6
      },
      "viewerMotivations": [
        "curse mystery",
        "death scenes",
        "school horror",
        "creepy atmosphere"
      ],
      "idealFollowUps": [
        "higurashi",
        "shiki",
        "boogiepop-phantom"
      ]
    }
  ],
  "relationships": [
    {
      "from": "higurashi",
      "to": "summertime-rendering",
      "weight": 0.78,
      "reason": "loop mystery, paranoia, and small-town danger"
    },
    {
      "from": "shiki",
      "to": "monster",
      "weight": 0.64,
      "reason": "slow moral horror rather than jump scares"
    },
    {
      "from": "another",
      "to": "higurashi",
      "weight": 0.7,
      "reason": "school/rural horror with mystery escalation"
    }
  ],
  "joeNotes": {
    "higurashi": "Don't recommend this as just 'scary.' Recommend it when someone wants paranoia and mystery that keeps recontextualizing itself.",
    "shiki": "Shiki is for slow dread and moral collapse, not cheap scares.",
    "another": "Another is the easier horror pick: creepy, simple, and memorable."
  }
};
