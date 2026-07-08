export const COMEDY_MODULE = {
  "id": "comedy",
  "name": "Comedy Expert",
  "traits": [
    "funny",
    "comedy",
    "absurd",
    "parody",
    "chaos",
    "laugh"
  ],
  "cards": [
    {
      "id": "space-dandy",
      "titles": [
        "Space Dandy"
      ],
      "domain": "comedy sci-fi",
      "signature": "A stylish cosmic comedy about chasing aliens, vibes, and absolute nonsense across space.",
      "vibes": {
        "comedy": 9,
        "cyberpunk": 4,
        "sciFi": 8,
        "chaos": 8
      },
      "viewerMotivations": [
        "absurd sci-fi",
        "episodic comedy",
        "style",
        "music",
        "weird adventures"
      ],
      "idealFollowUps": [
        "gintama",
        "cowboy-bebop",
        "flcl"
      ]
    },
    {
      "id": "saiki-k",
      "titles": [
        "The Disastrous Life of Saiki K.",
        "Saiki K"
      ],
      "domain": "deadpan comedy",
      "signature": "Deadpan psychic comedy where being overpowered is mostly a social inconvenience.",
      "vibes": {
        "comedy": 10,
        "chaos": 6,
        "cozy": 5
      },
      "viewerMotivations": [
        "fast jokes",
        "deadpan humor",
        "school comedy",
        "overpowered parody"
      ],
      "idealFollowUps": [
        "nichijou",
        "daily-lives-high-school-boys",
        "gintama"
      ]
    },
    {
      "id": "hinamatsuri",
      "titles": [
        "Hinamatsuri"
      ],
      "domain": "comedy with heart",
      "signature": "Absurd psychic-yakuza comedy that secretly becomes one of the warmest found-family shows.",
      "vibes": {
        "comedy": 8,
        "wholesome": 8,
        "cozy": 7,
        "chaos": 6
      },
      "viewerMotivations": [
        "found family",
        "deadpan comedy",
        "warmth",
        "absurd setups"
      ],
      "idealFollowUps": [
        "spy-family",
        "barakamon",
        "saiki-k"
      ]
    }
  ],
  "relationships": [
    {
      "from": "space-dandy",
      "to": "gintama",
      "weight": 0.82,
      "reason": "absurd episodic comedy with real style"
    },
    {
      "from": "saiki-k",
      "to": "nichijou",
      "weight": 0.84,
      "reason": "fast surreal school comedy"
    },
    {
      "from": "hinamatsuri",
      "to": "spy-family",
      "weight": 0.78,
      "reason": "comedy that works because the family dynamic has heart"
    }
  ],
  "joeNotes": {
    "space-dandy": "This is what I'd recommend when someone wants funny sci-fi but doesn't want the show to take itself seriously.",
    "saiki-k": "If you want jokes-per-minute, Saiki K is one of the safest comedy picks.",
    "hinamatsuri": "The trick with Hinamatsuri is that it looks like nonsense, then hits you with actual warmth."
  }
};
