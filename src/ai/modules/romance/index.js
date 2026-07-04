export const ROMANCE_MODULE = {
  "id": "romance",
  "name": "Romance Expert",
  "traits": [
    "romance",
    "romcom",
    "flirty",
    "spicy",
    "wholesome",
    "relationship"
  ],
  "cards": [
    {
      "id": "takamine-san",
      "titles": [
        "Please Put Them On, Takamine-san"
      ],
      "domain": "flirty spicy rom-com",
      "signature": "A school rom-com built around teasing, embarrassment, and spicy absurdity.",
      "vibes": {
        "romance": 7,
        "comedy": 7,
        "spicy": 10,
        "wholesome": 3,
        "chaos": 6
      },
      "viewerMotivations": [
        "teasing",
        "ecchi comedy",
        "awkward male lead",
        "confident female lead"
      ],
      "idealFollowUps": [
        "my-dress-up-darling",
        "nagatoro",
        "uzaki-chan"
      ]
    },
    {
      "id": "nagatoro",
      "titles": [
        "Don't Toy with Me, Miss Nagatoro",
        "Nagatoro"
      ],
      "domain": "teasing rom-com",
      "signature": "A teasing rom-com where the joke slowly becomes genuine affection and growth.",
      "vibes": {
        "romance": 8,
        "comedy": 7,
        "spicy": 6,
        "wholesome": 6
      },
      "viewerMotivations": [
        "teasing",
        "chemistry",
        "awkward growth",
        "playful romance"
      ],
      "idealFollowUps": [
        "takagi-san",
        "my-dress-up-darling",
        "uzaki-chan"
      ]
    },
    {
      "id": "more-than-married-couple",
      "titles": [
        "More than a Married Couple, but Not Lovers"
      ],
      "domain": "spicy romantic comedy",
      "signature": "A flirty fake-couple setup that works because the chemistry keeps getting harder to ignore.",
      "vibes": {
        "romance": 9,
        "comedy": 6,
        "spicy": 8,
        "wholesome": 5
      },
      "viewerMotivations": [
        "fake relationship",
        "romantic tension",
        "flirty comedy",
        "progression"
      ],
      "idealFollowUps": [
        "my-dress-up-darling",
        "golden-time",
        "horimiya"
      ]
    }
  ],
  "relationships": [
    {
      "from": "takamine-san",
      "to": "nagatoro",
      "weight": 0.76,
      "reason": "teasing dynamic and embarrassed male lead"
    },
    {
      "from": "takamine-san",
      "to": "my-dress-up-darling",
      "weight": 0.72,
      "reason": "spicy confidence and rom-com chemistry"
    },
    {
      "from": "more-than-married-couple",
      "to": "my-dress-up-darling",
      "weight": 0.78,
      "reason": "flirty chemistry without losing the romance"
    }
  ],
  "joeNotes": {
    "takamine-san": "This is absolutely the 'no one admits they watch it' zone, but JoeAI should still understand the appeal.",
    "nagatoro": "Nagatoro is best recommended when the user wants teasing that softens into actual affection.",
    "more-than-married-couple": "This is for people who want spicy rom-com energy with actual romantic tension."
  }
};
