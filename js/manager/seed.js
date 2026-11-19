// Starter lists for the show planner, researched from public sources on the dates below.
// Venues change booking contacts and capacities: every entry links its sources and is marked
// "check before you reach out" until you tick it. Generated; edit the research, not this file.

export const SEED_VENUES_ON = "2026-11-18";
export const SEED_BANDS_ON = "2026-11-18";
export const SEED_VENUES = [
 {
  "id": "el-corazon",
  "name": "El Corazon",
  "city": "Seattle",
  "neighborhood": "Eastlake/Denny Triangle",
  "address": "",
  "capacity": 800,
  "capacityNote": "800 per El Corazon's own news page (The Stranger quote); no capacity on booking page.",
  "size": "large",
  "ages": "varies",
  "genres": [
   "punk",
   "metal",
   "emo",
   "alt"
  ],
  "website": "https://www.elcorazonseattle.com/",
  "instagram": "https://www.instagram.com/elcorazonseattle/",
  "booking": {
   "email": "booking@elcorazonseattle.com",
   "formUrl": "",
   "person": "Dana (booking@); Kevin: kevin@elcorazonseattle.com",
   "how": "Email booking@ with contact info, a description of your sound, website, where/with whom you have played, press, photos and streaming links (touring bands add dates). Allow 2-3 weeks for a reply, no in-person inquiries. Mostly door deals; local sets are about 30 min; they want about 10 people per band member and a 2-week-before/1-week-after local show gap."
  },
  "goodFor": "Weeknight local bill or opener on a touring package",
  "notes": "Own pages say both 21+ and All Ages (bar w/ ID) shows occur. Booking page welcomes weeknight shows. Sister room Funhouse is the 200-cap lounge.",
  "sources": [
   "https://www.elcorazonseattle.com/booking-specs",
   "https://www.elcorazonseattle.com/news/punk-metal-dive-bar-funhouse-to-return",
   "https://www.elcorazonseattle.com/venues-general-info-faq"
  ]
 },
 {
  "id": "funhouse",
  "name": "The Funhouse (El Corazon lounge)",
  "city": "Seattle",
  "neighborhood": "Eastlake/Denny Triangle",
  "address": "",
  "capacity": 200,
  "capacityNote": "200 per El Corazon news page (lounge converted to Funhouse).",
  "size": "small",
  "ages": "varies",
  "genres": [
   "punk",
   "metal",
   "hardcore"
  ],
  "website": "https://www.elcorazonseattle.com/",
  "instagram": "https://www.instagram.com/funhouseseattle/",
  "booking": {
   "email": "booking@elcorazonseattle.com",
   "formUrl": "",
   "person": "Dana (booking@)",
   "how": "Same process as El Corazon (shared booking page): email band info, streaming links, where you played, prospective dates; 2-3 week response time."
  },
  "goodFor": "First headline show / local bill",
  "notes": "Booked through El Corazon. Load-in 1 hour before doors per booking page.",
  "sources": [
   "https://www.elcorazonseattle.com/news/beloved-venue-the-funhouse-to-reopen-in-el-corazons-lounge-w7dxd",
   "https://www.elcorazonseattle.com/booking-specs"
  ]
 },
 {
  "id": "crocodile",
  "name": "The Crocodile",
  "city": "Seattle",
  "neighborhood": "Belltown",
  "address": "2505 1st Ave, Seattle, WA 98121",
  "capacity": 750,
  "capacityNote": "750 per venue's careers and 'music venues in Seattle' pages.",
  "size": "large",
  "ages": "varies",
  "genres": [
   "rock",
   "alt",
   "indie",
   "punk"
  ],
  "website": "https://www.thecrocodile.com/",
  "instagram": "https://www.instagram.com/thecrocodileseattle/",
  "booking": {
   "email": "",
   "formUrl": "",
   "person": "",
   "how": "No public band-booking email or form found. booking@thecrocodile.com is listed on the FAQ for private event rentals only; info@thecrocodile.com is general contact. Likely reached via a promoter/agent or as support on a touring bill."
  },
  "goodFor": "Later-stage target; support slot on a touring bill",
  "notes": "Complex also has Madame Lou's (300) and Here-After (100-seat theater).",
  "sources": [
   "https://www.thecrocodile.com/careers",
   "https://www.thecrocodile.com/faq",
   "https://www.thecrocodile.com/zine/music-venues-in-seattle-for-concerts"
  ]
 },
 {
  "id": "madame-lous",
  "name": "Madame Lou's (at The Crocodile)",
  "city": "Seattle",
  "neighborhood": "Belltown",
  "address": "2505 1st Ave, Seattle, WA 98121 (enter on Wall St)",
  "capacity": 300,
  "capacityNote": "300 per venue page.",
  "size": "mid",
  "ages": "varies",
  "genres": [
   "punk",
   "rock",
   "alt"
  ],
  "website": "https://www.thecrocodile.com/madame-lous",
  "instagram": "https://www.instagram.com/thecrocodileseattle/",
  "booking": {
   "email": "",
   "formUrl": "",
   "person": "",
   "how": "Page lists info@thecrocodile.com for contact only; no band booking process published. Page says the room hosts everything from all-ages punk shows to dance nights."
  },
  "goodFor": "Step-up headline in a 300 room if you have a draw",
  "notes": "Same booking caveat as The Crocodile.",
  "sources": [
   "https://www.thecrocodile.com/madame-lous",
   "https://www.thecrocodile.com/careers"
  ]
 },
 {
  "id": "neumos",
  "name": "Neumos",
  "city": "Seattle",
  "neighborhood": "Capitol Hill",
  "address": "925 E Pike St, Seattle, WA 98122",
  "capacity": 650,
  "capacityNote": "650 standing per third-party Unique Venues listing; neumos.com pages read give no capacity.",
  "size": "large",
  "ages": "varies",
  "genres": [
   "rock",
   "indie",
   "metal",
   "electronic"
  ],
  "website": "https://www.neumos.com/",
  "instagram": "",
  "booking": {
   "email": "sammy@neumos.com",
   "formUrl": "",
   "person": "Sammy (artist holds)",
   "how": "Official contact page lists sammy@neumos.com for private events and artist holds. Look Up Records advises DIY bands not to cold-pitch Neumos or Showbox."
  },
  "goodFor": "Later target; support on a regional/touring bill",
  "notes": "Look Up Records lists eli@neumos.com (national) and evan@neumos.com (local) for Barboza holds; the official contact page now lists sammy@neumos.com. Treat the official page as current.",
  "sources": [
   "https://www.neumos.com/contact",
   "https://www.uniquevenues.com/venue/neumos/",
   "https://www.look-up-records.com/blog/15-small-capacity-venues-in-seattle-for-touring-bands"
  ]
 },
 {
  "id": "barboza",
  "name": "Barboza",
  "city": "Seattle",
  "neighborhood": "Capitol Hill",
  "address": "925 E Pike St (below Neumos), Seattle, WA 98122",
  "capacity": 250,
  "capacityNote": "250 per neumos.com private events page; RA says 208 standing; one ticket reseller says about 100.",
  "size": "mid",
  "ages": "varies",
  "genres": [
   "rock",
   "punk",
   "metal",
   "indie"
  ],
  "website": "https://www.thebarboza.com/",
  "instagram": "",
  "booking": {
   "email": "sammy@neumos.com",
   "formUrl": "",
   "person": "Sammy (artist holds)",
   "how": "Contact page lists sammy@neumos.com for artist holds; email with dates, bio, links and draw. Look Up Records notes weekend band shows end early for dance nights."
  },
  "goodFor": "Strong first mid-size headline after small-bar shows",
  "notes": "Capacity sources disagree (250 / 208 / about 100).",
  "sources": [
   "https://www.thebarboza.com/contact",
   "https://www.neumos.com/private-events",
   "https://ra.co/clubs/66558",
   "https://www.look-up-records.com/blog/15-small-capacity-venues-in-seattle-for-touring-bands"
  ]
 },
 {
  "id": "chop-suey",
  "name": "Chop Suey",
  "city": "Seattle",
  "neighborhood": "Capitol Hill",
  "address": "1325 E Madison St, Seattle",
  "capacity": 500,
  "capacityNote": "500 per third-party Unique Venues listing; chopsuey.com contact page gives no capacity.",
  "size": "mid",
  "ages": "varies",
  "genres": [
   "rock",
   "punk",
   "emo",
   "alt"
  ],
  "website": "https://chopsuey.com/",
  "instagram": "",
  "booking": {
   "email": "booking@chopsuey.com",
   "formUrl": "",
   "person": "",
   "how": "Email booking with: how you describe your music, weekday draw, bands you pair with locally, where/with whom you have played, press/radio, plus site and streaming links. They want bands with established fanbases; unsigned touring bands should pair with locals who draw. Two-week blackout between Seattle shows."
  },
  "goodFor": "Headline once you have a proven draw; weeknight support",
  "notes": "Email is Cloudflare-obscured on the official contact page; booking@chopsuey.com comes from Look Up Records. Look Up says lounge shows and RSVP-gated main stage shows exist for smaller bands.",
  "sources": [
   "https://chopsuey.com/contact/",
   "https://www.uniquevenues.com/venue/chop-suey/",
   "https://www.look-up-records.com/blog/15-small-capacity-venues-in-seattle-for-touring-bands"
  ]
 },
 {
  "id": "substation",
  "name": "Substation",
  "city": "Seattle",
  "neighborhood": "Ballard/Fremont",
  "address": "645 NW 45th St, Seattle",
  "capacity": 150,
  "capacityNote": "150 per Do206 listing; a ticket reseller lists 200 (main showroom) / 400 (large) / 600 total, so sources disagree.",
  "size": "small",
  "ages": "21+",
  "genres": [
   "metal",
   "punk",
   "rock",
   "electronic"
  ],
  "website": "https://substationseattle.com/",
  "instagram": "https://www.instagram.com/substation.seattle/",
  "booking": {
   "email": "booking@substationseattle.com",
   "formUrl": "",
   "person": "",
   "how": "Look Up Records lists booking@substationseattle.com. Describe your project, links and draw; bookers are described as supportive of emerging talent."
  },
  "goodFor": "First headline / local metal-punk bills",
  "notes": "Venue's own /booking page returned 404; email is from Look Up Records. Two stages plus a side room per the same source.",
  "sources": [
   "https://do206.com/venues/substation",
   "https://www.look-up-records.com/blog/15-small-capacity-venues-in-seattle-for-touring-bands",
   "https://tickets-center.com/the-glitch-mob-substation-seattle"
  ]
 },
 {
  "id": "sunset-tavern",
  "name": "The Sunset Tavern",
  "city": "Seattle",
  "neighborhood": "Ballard",
  "address": "5433 Ballard Ave NW, Seattle",
  "capacity": 200,
  "capacityNote": "Sellout is 200 per the venue's booking page.",
  "size": "small",
  "ages": "21+",
  "genres": [
   "rock",
   "punk",
   "indie",
   "alt"
  ],
  "website": "https://sunsettavern.com/",
  "instagram": "https://www.instagram.com/thesunsettavern/",
  "booking": {
   "email": "booking@sunsettavern.com",
   "formUrl": "https://sunsettavern.com/booking",
   "person": "",
   "how": "Submit via the booking form. They book 2-3 months ahead (4-6 months for weekends in March/October). Targets: about 50 attendees midweek, 125-150 ticket buyers Fri/Sat. Include dates, Seattle history/turnout and local bands joining. No mailed demos, no phone calls. Strictly 21+; underage members may only be present for load-in, their set and load-out."
  },
  "goodFor": "First headline show; local showcase",
  "notes": "Email booking@sunsettavern.com is from Look Up Records; the official page directs to a form.",
  "sources": [
   "https://sunsettavern.com/booking",
   "https://www.look-up-records.com/blog/15-small-capacity-venues-in-seattle-for-touring-bands",
   "https://www.vividseats.com/the-sunset-tavern-tickets/venue/12070"
  ]
 },
 {
  "id": "central-saloon",
  "name": "The Central Saloon",
  "city": "Seattle",
  "neighborhood": "Pioneer Square",
  "address": "207 1st Ave S, Seattle",
  "capacity": 190,
  "capacityNote": "190 max reception capacity per Visit Seattle listing.",
  "size": "small",
  "ages": "21+",
  "genres": [
   "rock",
   "punk",
   "metal",
   "grunge"
  ],
  "website": "https://centralsaloon.com/",
  "instagram": "https://www.instagram.com/centralsaloon/",
  "booking": {
   "email": "booking@centralsaloon.com",
   "formUrl": "https://centralsaloon.com/contact/",
   "person": "",
   "how": "FAQ: use the form on the contact page or email booking@centralsaloon.com."
  },
  "goodFor": "Weekend local bill with built-in walk-in crowd",
  "notes": "Look Up Records notes a renovated tall stage and a built-in weekend audience. 21+ is from Do206/Look Up; the FAQ does not state an age policy.",
  "sources": [
   "https://centralsaloon.com/faq/",
   "https://visitseattle.org/members/the-central-saloon/",
   "https://www.look-up-records.com/blog/15-small-capacity-venues-in-seattle-for-touring-bands"
  ]
 },
 {
  "id": "clock-out-lounge",
  "name": "Clock-Out Lounge",
  "city": "Seattle",
  "neighborhood": "Beacon Hill",
  "address": "4864 Beacon Ave S, Seattle, WA 98108",
  "capacity": null,
  "capacityNote": "No reliable capacity found; one reseller says 37, which is implausible for a stage room. Left null.",
  "size": "small",
  "ages": "all ages until 8pm, then 21+",
  "genres": [
   "rock",
   "indie",
   "punk",
   "misc"
  ],
  "website": "https://clockoutlounge.com/",
  "instagram": "",
  "booking": {
   "email": "booking@clockoutlounge.com",
   "formUrl": "https://clockoutlounge.com/booking/",
   "person": "",
   "how": "Email an EPK with audio links (no ReverbNation). Answer: how you describe your music, typical draw, local bands you pair with, where/with whom you have played, press/radio."
  },
  "goodFor": "Local bills and occasional touring support",
  "notes": "Email is Cloudflare-obscured on the official page; address is from Look Up Records. Family friendly until 8pm per venue.",
  "sources": [
   "https://clockoutlounge.com/booking/",
   "https://clockoutlounge.com/venue-info/",
   "https://www.look-up-records.com/blog/15-small-capacity-venues-in-seattle-for-touring-bands"
  ]
 },
 {
  "id": "skylark",
  "name": "Skylark Cafe & Club",
  "city": "Seattle",
  "neighborhood": "West Seattle",
  "address": "",
  "capacity": null,
  "capacityNote": "No capacity found in sources read.",
  "size": "small",
  "ages": "all ages until 10pm, then 21+",
  "genres": [
   "rock",
   "alt",
   "covers",
   "local"
  ],
  "website": "https://www.skylarkcafe.com/",
  "instagram": "https://www.instagram.com/skylarkcafe/",
  "booking": {
   "email": "",
   "formUrl": "https://www.skylarkcafe.com/booking",
   "person": "",
   "how": "Book through the online press-kit/booking form; press-kit info is published on their local-artist page and the booking agent reviews the form."
  },
  "goodFor": "Easy first West Seattle show; build a local draw",
  "notes": "Bills are mostly West Seattle originals/covers; heavier acts less common. An emo singalong night is listed. Address not confirmed in sources.",
  "sources": [
   "https://www.skylarkcafe.com/booking",
   "https://www.skylarkcafe.com/about-us"
  ]
 },
 {
  "id": "showbox",
  "name": "The Showbox",
  "city": "Seattle",
  "neighborhood": "Pike Place Market",
  "address": "1426 1st Ave, Seattle, WA 98101",
  "capacity": 1100,
  "capacityNote": "1,100 standing per Showbox rentals page; Wikipedia/Pollstar give 1,148-1,150.",
  "size": "large",
  "ages": "varies",
  "genres": [
   "rock",
   "indie",
   "alt",
   "pop"
  ],
  "website": "https://www.showboxpresents.com/",
  "instagram": "",
  "booking": {
   "email": "",
   "formUrl": "",
   "person": "",
   "how": "No public band-booking contact found (AEG-owned). showbox.questions@gmail.com is listed for ADA/info only. Reached via promoters/agents."
  },
  "goodFor": "Not a cold-pitch room; target via support slots",
  "notes": "AEG Presents venue.",
  "sources": [
   "https://www.showboxpresents.com/event-rentals",
   "https://www.showboxpresents.com/plan-your-visit/frequently-asked-questions",
   "https://news.pollstar.com/2007/12/12/aeg-buys-showbox-clubs/"
  ]
 },
 {
  "id": "showbox-sodo",
  "name": "Showbox SoDo",
  "city": "Seattle",
  "neighborhood": "SoDo",
  "address": "",
  "capacity": 1800,
  "capacityNote": "1,800 per Showbox and AEG pages; 2007 Pollstar said 1,511.",
  "size": "large",
  "ages": "varies",
  "genres": [
   "rock",
   "metal",
   "alt",
   "punk"
  ],
  "website": "https://www.showboxpresents.com/",
  "instagram": "",
  "booking": {
   "email": "",
   "formUrl": "",
   "person": "",
   "how": "No public booking contact found (AEG). Support slots arrive via promoters/agents."
  },
  "goodFor": "Goal-tier room for tours",
  "notes": "Sources disagree on historic capacity (1,511 vs 1,800); current official figure is 1,800.",
  "sources": [
   "https://www.showboxpresents.com/event-rentals",
   "https://aegsev.com/showbox-sodo",
   "https://news.pollstar.com/2007/12/12/aeg-buys-showbox-clubs/"
  ]
 },
 {
  "id": "vera-project",
  "name": "The Vera Project",
  "city": "Seattle",
  "neighborhood": "Seattle Center",
  "address": "Northwest Rooms, Seattle Center",
  "capacity": 362,
  "capacityNote": "362-capacity showroom per Vera history page. A 250-300 cap Georgetown venue is planned for early 2027.",
  "size": "mid",
  "ages": "all ages",
  "genres": [
   "punk",
   "indie",
   "hardcore",
   "emo"
  ],
  "website": "https://theveraproject.org/",
  "instagram": "",
  "booking": {
   "email": "",
   "formUrl": "https://theveraproject.org/v25-all-ages-all-access/",
   "person": "",
   "how": "Community-curated programming: Hidden Track (open applications for show organizers; RFP opened Feb 26, 2026) and Veracity (youth-led booking committee). No general booking email found."
  },
  "goodFor": "All-ages local show; organizer-driven",
  "notes": "Current 2026 programming is free all-ages shows. Check the site for open RFP windows.",
  "sources": [
   "https://theveraproject.org/about/history/",
   "https://theveraproject.org/v25-all-ages-all-access/",
   "https://theveraproject.org/vera25/"
  ]
 },
 {
  "id": "black-lodge",
  "name": "Black Lodge",
  "city": "Seattle",
  "neighborhood": "Eastlake/South Lake Union",
  "address": "Republican St & Eastlake Ave, Seattle",
  "capacity": null,
  "capacityNote": "No capacity found.",
  "size": "small",
  "ages": "all ages",
  "genres": [
   "punk",
   "hardcore",
   "metal",
   "diy"
  ],
  "website": "https://theveraproject.org/blacklodge/",
  "instagram": "",
  "booking": {
   "email": "",
   "formUrl": "",
   "person": "",
   "how": "Run by The Vera Project since reopening; shows are presented by Vera. No public booking contact found; try Vera's Hidden Track or Veracity programs."
  },
  "goodFor": "All-ages DIY punk/hardcore bill",
  "notes": "Look Up Records (older) says bookers are hard to pin down.",
  "sources": [
   "https://theveraproject.org/blacklodge/",
   "https://www.seattletimes.com/entertainment/music/diy-music-venue-black-lodge-reopens-in-seattles-south-lake-union/",
   "https://www.look-up-records.com/blog/15-small-capacity-venues-in-seattle-for-touring-bands"
  ]
 },
 {
  "id": "nectar-lounge",
  "name": "Nectar Lounge",
  "city": "Seattle",
  "neighborhood": "Fremont",
  "address": "",
  "capacity": 400,
  "capacityNote": "400 per LNE listing; others say 450 (Discotech/Fever) or 489 (Eventective).",
  "size": "mid",
  "ages": "varies",
  "genres": [
   "rock",
   "jam",
   "funk",
   "hip-hop",
   "alt"
  ],
  "website": "https://nectarlounge.com/",
  "instagram": "https://www.instagram.com/nectarlounge/",
  "booking": {
   "email": "Booking@nectarlounge.com",
   "formUrl": "",
   "person": "",
   "how": "Sister venue Hidden Hall's contact page lists Booking@nectarlounge.com for booking inquiries, artists and management."
  },
  "goodFor": "Mid-size local headline",
  "notes": "Email is from Hidden Hall's page, not seen on Nectar's own pages. Heavier acts are not the core.",
  "sources": [
   "https://hiddenhall.com/contact/",
   "https://lnepresents.com/venues/nectar-lounge/",
   "https://app.discotech.me/seattle/nectar-lounge"
  ]
 },
 {
  "id": "hidden-hall",
  "name": "Hidden Hall",
  "city": "Seattle",
  "neighborhood": "Fremont",
  "address": "400 N 35th St, Seattle, WA 98103",
  "capacity": 320,
  "capacityNote": "320 per CelebrityAccess opening report; Do206 says 350.",
  "size": "mid",
  "ages": "21+",
  "genres": [
   "rock",
   "hip-hop",
   "jam",
   "varied"
  ],
  "website": "https://hiddenhall.com/",
  "instagram": "",
  "booking": {
   "email": "Booking@nectarlounge.com",
   "formUrl": "",
   "person": "",
   "how": "Email Booking@nectarlounge.com (artists and management)."
  },
  "goodFor": "Mid-size headline; successor to High Dive",
  "notes": "Opened April 2025; Nectar team runs it. Age 21+ shown on site snippet.",
  "sources": [
   "https://hiddenhall.com/contact/",
   "https://celebrityaccess.com/2025/05/01/hidden-hall-makes-its-debut-in-seattle/",
   "https://do206.com/venues/hidden-hall"
  ]
 },
 {
  "id": "highline",
  "name": "Highline",
  "city": "Seattle",
  "neighborhood": "Capitol Hill",
  "address": "210 Broadway Ave E, Seattle, WA 98102",
  "capacity": 450,
  "capacityNote": "450 standing per Highline's own (older) booking page.",
  "size": "mid",
  "ages": "21+",
  "genres": [
   "metal",
   "punk",
   "hardcore"
  ],
  "website": "https://www.highlineseattle.com/",
  "instagram": "",
  "booking": {
   "email": "highlinevolume@gmail.com",
   "formUrl": "https://highlineseattle.tumblr.com/booking.html",
   "person": "",
   "how": "Look Up Records lists highlinevolume@gmail.com. The old booking page says load-in 6:30-8pm and door staff start at 9pm."
  },
  "goodFor": "Heavy/punk bills, strong touring-band fit",
  "notes": "Highline's own site is live (210 Broadway Ave E) but the booking page is an older Tumblr; confirm they are still booking. 21+ is from Look Up context, unconfirmed.",
  "sources": [
   "https://highlineseattle.tumblr.com/booking.html",
   "https://www.highlineseattle.com/",
   "https://www.look-up-records.com/blog/15-small-capacity-venues-in-seattle-for-touring-bands"
  ]
 },
 {
  "id": "tractor-tavern",
  "name": "Tractor Tavern",
  "city": "Seattle",
  "neighborhood": "Ballard",
  "address": "5213 Ballard Ave NW, Seattle",
  "capacity": 430,
  "capacityNote": "430 standing per Wrapbook interview with the talent booker; other sources say 400 / 500 / 550.",
  "size": "mid",
  "ages": "varies",
  "genres": [
   "americana",
   "rock",
   "indie"
  ],
  "website": "https://www.tractortavern.com/",
  "instagram": "",
  "booking": {
   "email": "",
   "formUrl": "",
   "person": "Jeff Rogness (talent booker)",
   "how": "No booking contact found. Booker calls the room a country and Americana stalwart; weaker genre fit for alt-metal."
  },
  "goodFor": "Lower priority mid-size stepping stone",
  "notes": "Capacity sources disagree (400-550). Website URL not verified.",
  "sources": [
   "https://www.wrapbook.com/blog/small-venues-jeff-rogness-tractor-tavern",
   "https://do206.com/venues/the-tractor-tavern"
  ]
 },
 {
  "id": "jazzbones",
  "name": "Jazzbones",
  "city": "Tacoma",
  "neighborhood": "Theater District",
  "address": "2803 6th Ave, Tacoma, WA 98406",
  "capacity": 400,
  "capacityNote": "400 per IndieOnTheMove; Vivid Seats says 300.",
  "size": "mid",
  "ages": "21+",
  "genres": [
   "rock",
   "covers",
   "tribute",
   "varied"
  ],
  "website": "https://jazzbones.com/",
  "instagram": "",
  "booking": {
   "email": "booking@jazzbones.com",
   "formUrl": "",
   "person": "",
   "how": "Site lists booking@jazzbones.com but labels it Private Events & Rentals; also a downloadable tech rider. A third-party site lists rachel@jazzbones.com. Confirm the right contact before pitching."
  },
  "goodFor": "Tacoma mid-size show; cover/tribute-heavy",
  "notes": "Site returned 403 to fetch; details are from search snippets. Capacity sources disagree.",
  "sources": [
   "https://jazzbones.com/",
   "https://www.indieonthemove.com/venues/jazzbones-tacoma-washington",
   "https://www.vividseats.com/jazzbones-nightclub-and-restaurant-tickets/venue/14676"
  ]
 },
 {
  "id": "real-art-tacoma",
  "name": "Real Art Tacoma",
  "city": "Tacoma",
  "neighborhood": "",
  "address": "",
  "capacity": 300,
  "capacityNote": "300 per venue specs page.",
  "size": "mid",
  "ages": "all ages (drug and alcohol free)",
  "genres": [
   "punk",
   "emo",
   "metal",
   "hardcore"
  ],
  "website": "https://www.realarttacoma.com/",
  "instagram": "https://www.instagram.com/realarttacoma/",
  "booking": {
   "email": "booking@realarttacoma.com",
   "formUrl": "",
   "person": "",
   "how": "Email dates, band pitch, music links, Pierce County draw, who you've played with, genre/FFO and whether anyone is under 21. Fri/Sat booked about 90 days out. Prefers Tacoma locals plus regional support; youth acts prioritized; door deal, merch 100% to artist."
  },
  "goodFor": "All-ages Tacoma headliner or support",
  "notes": "Has hosted emo nights.",
  "sources": [
   "https://www.realarttacoma.com/how-to-book",
   "https://www.realarttacoma.com/venue-specs"
  ]
 },
 {
  "id": "spanish-ballroom",
  "name": "Spanish Ballroom (McMenamins Elks Temple)",
  "city": "Tacoma",
  "neighborhood": "Downtown",
  "address": "",
  "capacity": 700,
  "capacityNote": "700 per IndieOnTheMove/LNE; FOH says 750.",
  "size": "large",
  "ages": "varies",
  "genres": [
   "rock",
   "alt",
   "tribute"
  ],
  "website": "https://www.mcmenamins.com/elks-temple/spanish-ballroom",
  "instagram": "https://www.instagram.com/spanishballroom/",
  "booking": {
   "email": "",
   "formUrl": "",
   "person": "Andy Moreno (Capacity Entertainment)",
   "how": "No booking email found. A conference bio says Andy Moreno of Capacity Entertainment books McMenamins properties including the Spanish Ballroom."
  },
  "goodFor": "Aspirational; opener on a touring show",
  "notes": "Bio source is a snippet only; verify directly.",
  "sources": [
   "https://lnepresents.com/venues/spanish-ballroom/",
   "https://fohonline.com/articles/installations/tacomas-spanish-ballroom/",
   "https://seattlefilmsummit.com/andy-moreno"
  ]
 },
 {
  "id": "make-shift",
  "name": "Make.Shift Art Space",
  "city": "Bellingham",
  "neighborhood": "Downtown Arts District",
  "address": "306 Flora St, Bellingham",
  "capacity": null,
  "capacityNote": "No capacity found.",
  "size": "small",
  "ages": "all ages",
  "genres": [
   "punk",
   "diy",
   "indie",
   "experimental"
  ],
  "website": "https://makeshiftartspace.org/venue",
  "instagram": "https://www.instagram.com/make.shiftartspace/",
  "booking": {
   "email": "",
   "formUrl": "https://makeshiftartspace.org/venue",
   "person": "",
   "how": "Use the booking form linked on the venue page; include other acts and estimated turnout. Booked 2-3 months out; shows mostly Fri/Sat. New Band Night is Nov 21, 2026 (submissions closed Oct 24)."
  },
  "goodFor": "All-ages Bellingham DIY show",
  "notes": "Substance-free space.",
  "sources": [
   "https://makeshiftartspace.org/venue",
   "https://www.bellingham.org/music-and-art-at-makeshift-art-space-in-bellingham"
  ]
 },
 {
  "id": "shakedown-bellingham",
  "name": "The Shakedown",
  "city": "Bellingham",
  "neighborhood": "",
  "address": "1212 N State St, Bellingham, WA 98225",
  "capacity": null,
  "capacityNote": "No capacity found.",
  "size": "small",
  "ages": "21+ (listed shows are 21+)",
  "genres": [
   "rock",
   "post-hardcore",
   "punk",
   "varied"
  ],
  "website": "https://shakedownbellingham.com/",
  "instagram": "",
  "booking": {
   "email": "booking@shakedownbellingham.com",
   "formUrl": "",
   "person": "",
   "how": "Email booking@shakedownbellingham.com."
  },
  "goodFor": "Bellingham bar show",
  "notes": "Recent calendar includes rock, grunge and post-hardcore bills.",
  "sources": [
   "https://shakedownbellingham.com/contact/",
   "https://shakedownbellingham.com/"
  ]
 },
 {
  "id": "tony-vs-garage",
  "name": "Tony V's Garage",
  "city": "Everett",
  "neighborhood": "Downtown",
  "address": "1716 Hewitt Ave, Everett, WA 98201",
  "capacity": 400,
  "capacityNote": "Up to 400 per BizBuySell listing and Bandsintown.",
  "size": "mid",
  "ages": "all ages until about 11pm on some shows",
  "genres": [
   "punk",
   "rock",
   "covers",
   "horror punk"
  ],
  "website": "",
  "instagram": "",
  "booking": {
   "email": "",
   "formUrl": "",
   "person": "",
   "how": "No booking contact found. Phone 425-374-3567 (Bandsintown)."
  },
  "goodFor": "Everett punk/rock bill",
  "notes": "A BizBuySell listing ('Opportunity to own a legend') suggests the business may be for sale; confirm it is operating. No venue website verified.",
  "sources": [
   "https://www.bizbuysell.com/business-opportunity/opportunity-to-own-a-legend/2438552/",
   "https://www.discoversnohomishcounty.com/blog/music-guide-to-snohomish-county/"
  ]
 },
 {
  "id": "lucky-dime",
  "name": "Lucky Dime",
  "city": "Everett",
  "neighborhood": "Downtown",
  "address": "1618 Hewitt Ave, Everett, WA 98201",
  "capacity": 100,
  "capacityNote": "100 standing per IndieOnTheMove and Bandsintown.",
  "size": "small",
  "ages": "all ages (some shows)",
  "genres": [
   "punk",
   "indie",
   "hip-hop",
   "loud"
  ],
  "website": "https://www.luckydimewa.com/",
  "instagram": "https://www.instagram.com/luckydime.wa/",
  "booking": {
   "email": "",
   "formUrl": "",
   "person": "",
   "how": "Site has Events, Contact, Rentals and FAQ pages; booking process not retrieved."
  },
  "goodFor": "Small Everett show; all-ages bills",
  "notes": "Check the site's Contact page for booking.",
  "sources": [
   "https://www.indieonthemove.com/venues/lucky-dime-everett-washington",
   "https://www.discoversnohomishcounty.com/blog/music-guide-to-snohomish-county/"
  ]
 },
 {
  "id": "kraken",
  "name": "The Kraken Bar & Lounge",
  "city": "Seattle",
  "neighborhood": "University District",
  "address": "5828 Roosevelt Way NE, Seattle",
  "capacity": null,
  "capacityNote": "No capacity found.",
  "size": "small",
  "ages": "21+",
  "genres": [
   "punk",
   "metal",
   "rock"
  ],
  "website": "",
  "instagram": "",
  "booking": {
   "email": "",
   "formUrl": "",
   "person": "",
   "how": "No booking contact found. Phone (206) 522-5334."
  },
  "goodFor": "Punk/metal bar bills",
  "notes": "Moved to this space in April 2024 per Seattle Times. 21+ unconfirmed. No official website verified.",
  "sources": [
   "https://www.seattletimes.com/pacific-nw-magazine/seattles-beloved-kraken-bar-has-a-new-location-with-the-same-cool-vibe/",
   "https://www.kineticist.com/locations/the-kraken-bar-and-lounge"
  ]
 },
 {
  "id": "le-voyeur",
  "name": "Le Voyeur",
  "city": "Olympia",
  "neighborhood": "Downtown",
  "address": "",
  "capacity": 50,
  "capacityNote": "50 per Bandsintown.",
  "size": "small",
  "ages": "varies",
  "genres": [
   "punk",
   "rock",
   "indie"
  ],
  "website": "",
  "instagram": "",
  "booking": {
   "email": "",
   "formUrl": "",
   "person": "",
   "how": "No booking contact found."
  },
  "goodFor": "Olympia gig on a regional run",
  "notes": "Verify directly.",
  "sources": [
   "https://www.bandsintown.com/v/10004677-le-voyeur",
   "https://everout.com/seattle/locations/le-voyeur-olympia/l13407/"
  ]
 }
];
export const SEED_BANDS = [
 {
  "id": "bathypelagic",
  "name": "Bathypelagic",
  "city": "Seattle",
  "genres": [
   "heavy"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-18",
  "socials": {
   "instagram": "https://www.instagram.com/bathypelagic_band/",
   "tiktok": "",
   "spotify": "",
   "bandcamp": "https://bathypelagic.bandcamp.com/album/lahar",
   "youtube": "",
   "website": "",
   "facebook": ""
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Bathypelagic is a heavy music duo based in Seattle, Washington.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/rain-city-doom-fest-2026-18-dec"
  ]
 },
 {
  "id": "boydream",
  "name": "Boydream",
  "city": "Seattle",
  "genres": [
   "emo",
   "pop-punk",
   "rock",
   "shoegaze"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-26",
  "socials": {
   "instagram": "https://www.instagram.com/boydreamwa",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/1di04o6FOVSnNQmuWA1iSE",
   "bandcamp": "",
   "youtube": "",
   "website": "",
   "facebook": ""
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Boydream is a Seattle-based emo rock and \"nudreamgaze\" band.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/boydream-26-dec"
  ]
 },
 {
  "id": "brake-down",
  "name": "Brake Down",
  "city": "Seattle",
  "genres": [
   "alternative rock"
  ],
  "active": "Booked at El Corazon / Funhouse, 2027-01-10",
  "socials": {
   "instagram": "https://www.instagram.com/brakedownband/",
   "tiktok": "",
   "spotify": "",
   "bandcamp": "",
   "youtube": "",
   "website": "",
   "facebook": ""
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "We're a Seattle-based, female-fronted alternative rock band (think 90s, early 2000s) that practices at our local auto shop.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/the-basement-rockmomenough-brake-down-10-jan"
  ]
 },
 {
  "id": "christian-mistress",
  "name": "Christian Mistress",
  "city": "Olympia",
  "genres": [
   "grunge",
   "metal",
   "heavy"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-18",
  "socials": {
   "instagram": "https://www.instagram.com/christianmistress/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/0fEyv0n8MBgXZQLOMcHbZO",
   "bandcamp": "https://christianmistress.bandcamp.com/music",
   "youtube": "",
   "website": "",
   "facebook": ""
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Olympia, Washington's Christian Mistress fly in the face of the region's grunge-birthing reputation with a sound representing what was arguably the strongest musical style laid low by the flannel revolution: heavy metal.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/rain-city-doom-fest-2026-18-dec"
  ]
 },
 {
  "id": "city-of-reign",
  "name": "City Of Reign",
  "city": "Olympia",
  "genres": [
   "deathcore"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-11-20",
  "socials": {
   "instagram": "https://www.instagram.com/cityofreignwa/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/5niRPcBLsvqLYQflAfl3Y9",
   "bandcamp": "https://cityofreign.bandcamp.com/album/republicus-lord-of-war",
   "youtube": "",
   "website": "",
   "facebook": "https://www.facebook.com/Cityofreignoly/"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Originally formed in late 2014, City Of Reign is a politically impelled deathcore band from the showery Pacific Northwest.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/divinity-productions-presents-crucible-of-absolution-20-nov"
  ]
 },
 {
  "id": "cut-both-ways",
  "name": "Cut Both Ways",
  "city": "Seattle",
  "genres": [
   "hardcore"
  ],
  "active": "Listed on Do206",
  "socials": {
   "instagram": "",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/4POSTV64nV50R9djGXT5OA",
   "bandcamp": "https://cutbothwayshc.bandcamp.com",
   "youtube": "",
   "website": "",
   "facebook": ""
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Premiering in Summer of 2018, Cut Both Ways is a Seattle hardcore band formed by the unlikely union of three Midwest transplants and two Seattle locals who shared one goal: bringing as much energy to the stage as possibl",
  "playsAt": [],
  "notes": "",
  "sources": [
   "https://do206.com/artists/cut-both-ways",
   "https://cutbothwayshc.bandcamp.com"
  ]
 },
 {
  "id": "death-parade",
  "name": "Death Parade",
  "city": "Portland",
  "genres": [
   "heavy"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-18",
  "socials": {
   "instagram": "https://www.instagram.com/death.parade.band/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/3bEV1PmyJoIZ1PCHOFOFzm",
   "bandcamp": "https://deathparadepdx.bandcamp.com/music",
   "youtube": "",
   "website": "https://www.deathparadepdx.com/",
   "facebook": "https://www.facebook.com/death.parade.pdx/"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Death Parade is a heavy, doomgaze, and dreamdoom band based in Portland, Oregon (formerly known as Laura Palmer's Death Parade), though they frequently perform in the Pacific Northwest including Seattle.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/rain-city-doom-fest-2026-18-dec"
  ]
 },
 {
  "id": "deceiving-the-masses",
  "name": "Deceiving The Masses",
  "city": "Spokane",
  "genres": [
   "deathcore"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-11-20",
  "socials": {
   "instagram": "https://www.instagram.com/deceivingthemasses/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/1vTRD9GroKM1HnWBKhb9H4",
   "bandcamp": "https://deceivingthemasses.bandcamp.com/album/deceiving-the-masses",
   "youtube": "",
   "website": "",
   "facebook": "https://www.facebook.com/profile.php?id=61558790672358"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "PNW DEATHCORE 5 piece hailing from Spokane WA formed in 2023 and released our debut single “CEASE TO BE” January 31st 2024.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/divinity-productions-presents-crucible-of-absolution-20-nov"
  ]
 },
 {
  "id": "defier",
  "name": "Defier",
  "city": "Tacoma",
  "genres": [
   "deathcore",
   "metal"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-11-20",
  "socials": {
   "instagram": "https://www.instagram.com/defierbandofficial/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/1ADaQGvFNHZC4GYmyy6X0a",
   "bandcamp": "",
   "youtube": "",
   "website": "",
   "facebook": "https://www.facebook.com/defierbandofficial/"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Defier is an extreme metal and deathcore band based in Tacoma, Washington.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/divinity-productions-presents-crucible-of-absolution-20-nov"
  ]
 },
 {
  "id": "demensia",
  "name": "Demensia",
  "city": "Seattle",
  "genres": [
   "thrash",
   "death metal"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-11-29",
  "socials": {
   "instagram": "https://www.instagram.com/demansia.band?exln=MW55aXFzNWhseHRxZA==",
   "tiktok": "",
   "spotify": "",
   "bandcamp": "",
   "youtube": "",
   "website": "",
   "facebook": ""
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Demansia is a new and upcoming thrash/technical death metal band from Seattle.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/ancient-entities-echoes-over-america-tour-29-nov"
  ]
 },
 {
  "id": "dust-moth",
  "name": "Dust Moth",
  "city": "Seattle",
  "genres": [
   "rock"
  ],
  "active": "Listed on Do206",
  "socials": {
   "instagram": "",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/3Jpd65MlJhXetEF4v1Evxz",
   "bandcamp": "http://dustmoth.bandcamp.com/",
   "youtube": "",
   "website": "",
   "facebook": "https://www.facebook.com/dustmothband"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Dust Moth is a nocturnal juggernaut gravitating towards the light—a restless collective of Seattle art rock veterans injecting beauty and femininity into their wall-of-sound dirges.",
  "playsAt": [],
  "notes": "",
  "sources": [
   "https://do206.com/artists/dust-moth",
   "https://dustmothband.bandcamp.com"
  ]
 },
 {
  "id": "far-reaches",
  "name": "Far Reaches",
  "city": "Seattle",
  "genres": [
   "grunge",
   "heavy",
   "hard rock"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-10",
  "socials": {
   "instagram": "https://www.instagram.com/farreachesrock/",
   "tiktok": "",
   "spotify": "",
   "bandcamp": "",
   "youtube": "",
   "website": "",
   "facebook": ""
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "FarReaches is an original four-piece hard rock band based in Seattle, blending 90s grunge, 70s rock, and modern prog.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/far-reaches-electric-head-killbilly-primal-beast-10-dec"
  ]
 },
 {
  "id": "filth-is-eternal",
  "name": "Filth Is Eternal",
  "city": "Seattle",
  "genres": [
   "hardcore",
   "punk",
   "grunge",
   "metal"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-13",
  "socials": {
   "instagram": "https://www.instagram.com/filthiseternal",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/0BqcFG3uqS8l59OsCtIiH0",
   "bandcamp": "",
   "youtube": "https://www.youtube.com/@filthiseternal",
   "website": "https://filthiseternal.com/",
   "facebook": "https://www.facebook.com/filthiseternal/"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Filth Is Eternal is an American hardcore punk and heavy metal band formed in Seattle, Washington.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/ignite-w-year-of-the-cobra-13-dec",
   "https://do206.com/artists/filth-is-eternal"
  ]
 },
 {
  "id": "four-dead-seasons",
  "name": "Four Dead Seasons",
  "city": "Portland",
  "genres": [
   "deathcore",
   "hardcore",
   "death metal"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-11-20",
  "socials": {
   "instagram": "https://www.instagram.com/four_dead_seasons/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/6diByANF2yoaXuzHwmj5bt",
   "bandcamp": "",
   "youtube": "",
   "website": "https://fourdeadseasons.com/home",
   "facebook": "https://www.facebook.com/FourDeadSeasons/"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Four Dead Seasons is a Portland, Oregon-based independent metal band established in 2003 that blends elements of deathcore, hardcore, and brutal death metal.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/divinity-productions-presents-crucible-of-absolution-20-nov"
  ]
 },
 {
  "id": "gouged",
  "name": "Gouged",
  "city": "Seattle",
  "genres": [
   "deathcore",
   "metal",
   "heavy"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-11-25",
  "socials": {
   "instagram": "https://www.instagram.com/gougedpnw/",
   "tiktok": "https://www.tiktok.com/@GougedPNW",
   "spotify": "https://open.spotify.com/artist/5YBdymBwFJxlqr0l23Dusl",
   "bandcamp": "",
   "youtube": "https://www.youtube.com/@gougedpnw",
   "website": "",
   "facebook": "https://www.facebook.com/GougedPNW/"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Gouged is an underground Pacific Northwest deathcore and heavy metal band based out of the Seattle and Tacoma, Washington area.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/distant-into-despair-usa-tour-2026-25-nov",
   "https://do206.com/artists/gouged"
  ]
 },
 {
  "id": "heiress",
  "name": "Heiress",
  "city": "Seattle",
  "genres": [
   "hardcore",
   "punk",
   "metal",
   "rock",
   "grunge"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-18",
  "socials": {
   "instagram": "https://www.instagram.com/heiress_seattle/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/3sKj3Oc9JJog5J5XIAxi7v",
   "bandcamp": "https://heiress.bandcamp.com/music",
   "youtube": "",
   "website": "https://heiress.co/",
   "facebook": "https://www.facebook.com/Heiressy/"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Heiress is an American rock band from Seattle, WA featuring former members of Himsa, Undertow, Jough Dawn Baker and Shift.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/rain-city-doom-fest-2026-18-dec",
   "https://do206.com/artists/heiress",
   "https://heiress.bandcamp.com",
   "https://heiressband.bandcamp.com"
  ]
 },
 {
  "id": "honeyed",
  "name": "Honeyed",
  "city": "Tacoma",
  "genres": [
   "post-hardcore",
   "emo",
   "metal",
   "heavy"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-06",
  "socials": {
   "instagram": "https://www.instagram.com/honeyed_pnw/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/6J0zvCuXn9wCuU89NRLXkC",
   "bandcamp": "",
   "youtube": "https://www.youtube.com/channel/UCKYdq9eVpPET-2EVtg4AE5A/about",
   "website": "",
   "facebook": "https://www.facebook.com/p/Honeyed-Band-61550908856855/"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Honeyed is an independent Pacific Northwest post-hardcore and emo band based out of Tacoma, Washington.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/instant-crush-palettes-pastel-faces-honeyed-06-dec",
   "https://do206.com/artists/honeyed"
  ]
 },
 {
  "id": "instant-crush",
  "name": "Instant Crush",
  "city": "Seattle",
  "genres": [
   "rock"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-06",
  "socials": {
   "instagram": "https://www.instagram.com/weareinstantcrush/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/6CzsxPxOIeXoyhmNiFmtmu",
   "bandcamp": "",
   "youtube": "https://www.youtube.com/channel/UCQz5ePxV7LpgjEgX1a1u6oQ",
   "website": "https://weareinstantcrush.com/",
   "facebook": "https://www.facebook.com/weareinstantcrush"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Instant Crush is a Seattle-based alternative pop-rock band that blends hard-hitting indie rock energy with danceable pop rhythms.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/instant-crush-palettes-pastel-faces-honeyed-06-dec"
  ]
 },
 {
  "id": "kids-on-fire",
  "name": "Kids on Fire",
  "city": "Seattle",
  "genres": [
   "punk",
   "rock"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-11-21",
  "socials": {
   "instagram": "https://www.instagram.com/kids_on_fire_seattle/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/0pKqIU4uKerKQrDvp1NNnJ",
   "bandcamp": "",
   "youtube": "",
   "website": "",
   "facebook": "https://www.facebook.com/kidsonfirepnw/"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Hailing from the rain soaked streets of Seattle, comes the punk rock sweethearts, Kids on Fire.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/the-obgm-s-heart-problems-tour-21-nov"
  ]
 },
 {
  "id": "killbilly",
  "name": "Killbilly",
  "city": "Seattle",
  "genres": [
   "grunge"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-10",
  "socials": {
   "instagram": "https://www.instagram.com/killbillymusic/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/5VpUbvNyQ9c4BLSccc8Qpf",
   "bandcamp": "",
   "youtube": "",
   "website": "",
   "facebook": ""
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "4-piece Seattle grunge revivalists hitting the scene with a 4 track EP in the summer of 2024 and playing all over the region in coming months.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/far-reaches-electric-head-killbilly-primal-beast-10-dec"
  ]
 },
 {
  "id": "lacabra",
  "name": "Lacabra",
  "city": "Seattle",
  "genres": [
   "punk",
   "death metal"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-11-20",
  "socials": {
   "instagram": "https://www.instagram.com/lacabrametal/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/3vUiPAhpOCW2r5TdcyQrc3",
   "bandcamp": "https://lacabrametal.bandcamp.com/",
   "youtube": "https://www.youtube.com/watch?v=_vvFCE7JcCI",
   "website": "",
   "facebook": "https://www.facebook.com/lacabrametal/"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "LACABRA is an extreme metal band based in Seattle, Washington.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/fear-factory-cybernetic-domination-tour-2026-20-nov"
  ]
 },
 {
  "id": "mister-blank",
  "name": "Mister Blank",
  "city": "Seattle",
  "genres": [
   "punk"
  ],
  "active": "Booked at El Corazon / Funhouse, 2027-01-14",
  "socials": {
   "instagram": "https://www.instagram.com/misterblankofficial/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/7iCgVDrZSVxLEoe6Ajm1rg",
   "bandcamp": "",
   "youtube": "https://www.youtube.com/channel/UCRM5bPVlJKkcEN6-rX1W85g",
   "website": "https://misterblankband.com/",
   "facebook": "https://www.facebook.com/misterblankofficial/#"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Mister Blank is an eight-piece high-energy ska and punk band based in Seattle, Washington.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/mustard-plug-14-jan"
  ]
 },
 {
  "id": "modern-bird",
  "name": "Modern Bird",
  "city": "Seattle",
  "genres": [
   "punk"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-26",
  "socials": {
   "instagram": "https://www.instagram.com/modernbirdband/",
   "tiktok": "",
   "spotify": "",
   "bandcamp": "",
   "youtube": "",
   "website": "",
   "facebook": ""
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Modern Bird is an underground DIY trans-punk band based in Seattle, Washington.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/boydream-26-dec"
  ]
 },
 {
  "id": "mount-saturn",
  "name": "Mount Saturn",
  "city": "Bellingham",
  "genres": [
   "doom",
   "metal",
   "heavy"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-18",
  "socials": {
   "instagram": "https://www.instagram.com/mountsaturn/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/1a7Rk3101PadFf27XfzWAS&dl_branch=1",
   "bandcamp": "https://mountsaturn.bandcamp.com/music",
   "youtube": "",
   "website": "",
   "facebook": "https://www.facebook.com/mountsaturnband/"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Mount Saturn is a Pacific Northwest stoner/doom metal and heavy psych band originally formed in Bellingham, Washington, and currently based in Portland, Oregon.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/rain-city-doom-fest-2026-18-dec"
  ]
 },
 {
  "id": "odd-man-out",
  "name": "Odd Man Out",
  "city": "Seattle",
  "genres": [],
  "active": "Listed on Do206",
  "socials": {
   "instagram": "https://www.instagram.com/oddmanoutbandga",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/5wnAwAJumfgRhuqn1HNMEX",
   "bandcamp": "https://odd-man-out.bandcamp.com",
   "youtube": "",
   "website": "",
   "facebook": ""
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Odd Man Out supports a lifestyle that informs and inspires all forms of life.",
  "playsAt": [],
  "notes": "",
  "sources": [
   "https://do206.com/artists/odd-man-out",
   "https://odd-man-out.bandcamp.com"
  ]
 },
 {
  "id": "palettes",
  "name": "Palettes",
  "city": "Seattle",
  "genres": [
   "emo",
   "pop-punk",
   "heavy",
   "rock"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-06",
  "socials": {
   "instagram": "https://www.instagram.com/palettesband/",
   "tiktok": "https://www.tiktok.com/@palettesband",
   "spotify": "https://open.spotify.com/artist/6fktdsYeSWl3qSGekown62",
   "bandcamp": "https://palettesband.bandcamp.com",
   "youtube": "https://www.youtube.com/@palettesband",
   "website": "",
   "facebook": "https://www.facebook.com/palettesband/"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "palettes is an independent emo, rock, and pop-punk band formed in 2021 in Seattle, Washington.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/instant-crush-palettes-pastel-faces-honeyed-06-dec",
   "https://do206.com/artists/palettes",
   "https://palettesband.bandcamp.com"
  ]
 },
 {
  "id": "pastel-faces",
  "name": "Pastel Faces",
  "city": "Seattle",
  "genres": [
   "metalcore",
   "post-hardcore",
   "melodic hardcore",
   "emo"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-06",
  "socials": {
   "instagram": "https://www.instagram.com/pastelfaces_/",
   "tiktok": "https://www.tiktok.com/@pastelfaces_",
   "spotify": "https://open.spotify.com/artist/2ynLWEnx8MMjgKBVN7AfWo",
   "bandcamp": "",
   "youtube": "https://www.youtube.com/channel/UCN0gd2VJnphv5Gpo8FL9wdA",
   "website": "",
   "facebook": "https://www.facebook.com/pastelfaces/"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Pastel Faces is an independent melodic hardcore, post-hardcore, and emo band based right here in Seattle, Washington.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/instant-crush-palettes-pastel-faces-honeyed-06-dec",
   "https://do206.com/artists/pastel-faces"
  ]
 },
 {
  "id": "red-sky-riot",
  "name": "Red Sky Riot",
  "city": "Seattle",
  "genres": [
   "heavy"
  ],
  "active": "Booked at El Corazon / Funhouse, 2027-01-17",
  "socials": {
   "instagram": "https://www.instagram.com/redskyriot/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/2gCDGC4wxTlqlr9iWplU5K",
   "bandcamp": "",
   "youtube": "",
   "website": "",
   "facebook": ""
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Get ready for some hard hitting music made right here in Seattle!",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/red-sky-riot-drop-sea-no-more-enemies-17-jan",
   "https://do206.com/artists/red-sky-riot"
  ]
 },
 {
  "id": "riot-in-rhythm",
  "name": "Riot In Rhythm",
  "city": "Tacoma",
  "genres": [
   "punk",
   "rock"
  ],
  "active": "Booked at El Corazon / Funhouse, 2027-01-16",
  "socials": {
   "instagram": "https://www.instagram.com/riotinrhythm06",
   "tiktok": "",
   "spotify": "",
   "bandcamp": "https://riotinrhythm06.bandcamp.com/track/hourglass",
   "youtube": "https://www.youtube.com/@riotinrhythm06",
   "website": "",
   "facebook": "https://www.facebook.com/riotinrhythm"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Riot In Rhythm is an energetic, Tacoma-based rock band that blends raw punk attitude with authentic rock sounds.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/riot-in-rhythm-16-jan"
  ]
 },
 {
  "id": "running-savage",
  "name": "Running Savage",
  "city": "PNW",
  "genres": [
   "punk",
   "death metal"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-01",
  "socials": {
   "instagram": "",
   "tiktok": "",
   "spotify": "",
   "bandcamp": "",
   "youtube": "",
   "website": "",
   "facebook": ""
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Running Savage is a high-octane old school metal band hailing from the PNW.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/afterbirth-pulp-running-savage-no-sign-of-serenity-jettizon-01-dec"
  ]
 },
 {
  "id": "splitshift",
  "name": "Splitshift",
  "city": "Olympia",
  "genres": [
   "post-hardcore",
   "grunge",
   "alternative rock",
   "shoegaze"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-26",
  "socials": {
   "instagram": "https://www.instagram.com/splitshft/",
   "tiktok": "https://tiktok.com/@splitshft",
   "spotify": "https://open.spotify.com/artist/0BJyt7LD53L7CrYgsuMUDD",
   "bandcamp": "",
   "youtube": "https://www.youtube.com/@splitshft",
   "website": "",
   "facebook": "https://www.facebook.com/profile.php?id=61566296877334&mibextid=LQQJ4d&rdid=HDImkBe9coG8xlYT&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2F18ibRikj2Q%2F%3Fmibextid%3DLQQJ4d#"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Splitshft (pronounced \"Splitshift\") is an alternative rock band based just south of Seattle in Olympia, Washington, that regularly performs across the Seattle and Puget Sound music scenes.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/boydream-26-dec"
  ]
 },
 {
  "id": "sun-crow",
  "name": "Sun Crow",
  "city": "Seattle",
  "genres": [
   "doom",
   "heavy",
   "rock"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-18",
  "socials": {
   "instagram": "https://www.instagram.com/sun.crow.rock.heavy/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/5RsGTkPrSGRTERy7ZPONB0",
   "bandcamp": "https://suncrow.bandcamp.com/album/quest-for-oblivion",
   "youtube": "",
   "website": "",
   "facebook": "https://www.facebook.com/theSunCrow/"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Sun Crow is a Seattle-based heavy rock band.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/rain-city-doom-fest-2026-18-dec"
  ]
 },
 {
  "id": "the-basement",
  "name": "The Basement",
  "city": "Seattle",
  "genres": [
   "post-punk",
   "shoegaze"
  ],
  "active": "Booked at El Corazon / Funhouse, 2027-01-10",
  "socials": {
   "instagram": "https://www.instagram.com/thebasementseattle/",
   "tiktok": "https://www.tiktok.com/@thebasementseattle",
   "spotify": "",
   "bandcamp": "",
   "youtube": "https://www.youtube.com/@thebasementseattle",
   "website": "https://thebasementseattle.com/",
   "facebook": "https://www.facebook.com/thebasementseattle/"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "The Basement is a 5-member Seattle post-punk band writing original tunes featuring crisp vocals, and indie-shoegaze guitar textures.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/the-basement-rockmomenough-brake-down-10-jan"
  ]
 },
 {
  "id": "the-moon-is-flat",
  "name": "The Moon Is Flat",
  "city": "Everett",
  "genres": [
   "heavy",
   "rock"
  ],
  "active": "Booked at El Corazon / Funhouse, 2027-03-11",
  "socials": {
   "instagram": "https://www.instagram.com/themoonisflat",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/3UgKjqFxsgIkVaPIZ4cwCu",
   "bandcamp": "",
   "youtube": "https://www.youtube.com/channel/UCeXRIZiu99O1LZyJbFU_ggg",
   "website": "https://www.themoonisflat.com/",
   "facebook": "https://www.facebook.com/themoonisflat/"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "The Moon is Flat is an independent space, stoner, and psychedelic rock band based out of Everett, Washington.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/the-lemonheads-the-love-chant-tour-11-mar"
  ]
 },
 {
  "id": "the-moray",
  "name": "The Moray",
  "city": "Tacoma",
  "genres": [
   "punk"
  ],
  "active": "Booked at El Corazon / Funhouse, 2027-01-30",
  "socials": {
   "instagram": "https://www.instagram.com/themoray_official/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/1os5kJGu4CSsgg7YZdPpeG",
   "bandcamp": "https://themoray.bandcamp.com/",
   "youtube": "",
   "website": "",
   "facebook": "https://www.facebook.com/TheMoray/"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "The Moray is a three-piece folk-punk, protest folk, and riot folk band based out of Tacoma and western Washington.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/escape-from-the-zoo-if-you-re-treadin-water-you-re-still-kickin-2027-tour-30-jan"
  ]
 },
 {
  "id": "this-soil-is-diseased",
  "name": "This Soil Is Diseased",
  "city": "Seattle",
  "genres": [
   "metal",
   "heavy",
   "death metal"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-10-04",
  "socials": {
   "instagram": "https://www.instagram.com/tsidband/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/2HFm96wJopcO9A28nTMYMA",
   "bandcamp": "https://thissoilisdiseased.bandcamp.com/album/we-are-the-astronauts",
   "youtube": "",
   "website": "",
   "facebook": "https://www.facebook.com/TSIDband/"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "This Soil Is Diseased (TSID) is a heavy metal band based right here in Seattle, Washington.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/primer-55-shattered-schemes-broken-dreams-tour-04-oct",
   "https://do206.com/artists/this-soil-is-diseased"
  ]
 },
 {
  "id": "truancy",
  "name": "Truancy",
  "city": "PNW",
  "genres": [
   "hardcore",
   "punk",
   "rock"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-11-21",
  "socials": {
   "instagram": "https://www.instagram.com/truancysmokes/",
   "tiktok": "",
   "spotify": "",
   "bandcamp": "https://truancysmokes.bandcamp.com/music",
   "youtube": "",
   "website": "",
   "facebook": "https://www.facebook.com/TruancySmokes"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "TRUANCY grew their roots amidst the underground of the Pacific Northwest's DIY punk scene.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/the-obgm-s-heart-problems-tour-21-nov"
  ]
 },
 {
  "id": "wicked-game",
  "name": "Wicked Game",
  "city": "Tacoma",
  "genres": [
   "hardcore",
   "metal"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-05",
  "socials": {
   "instagram": "https://www.instagram.com/wickedgamehc/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/4JCCeVDzMqoXXMC3TSVrTN",
   "bandcamp": "",
   "youtube": "",
   "website": "",
   "facebook": ""
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Wicked Game is an emerging hardcore/metal band based out of Tacoma, Washington.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/mammoth-nw-presents-guilt-trip-05-dec",
   "https://do206.com/artists/wicked-game"
  ]
 },
 {
  "id": "witch-ripper",
  "name": "Witch Ripper",
  "city": "Seattle",
  "genres": [
   "metal"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-18",
  "socials": {
   "instagram": "https://www.instagram.com/witch_ripper/",
   "tiktok": "",
   "spotify": "https://open.spotify.com/artist/3v6xMwgOKzEYpZNalgtqhI",
   "bandcamp": "https://witchripper.bandcamp.com/music",
   "youtube": "",
   "website": "",
   "facebook": "https://www.facebook.com/Witchripper/"
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "Formed in 2012, Witch Ripper is a four-piece metal band from Seattle, WA that blends melodic prog and crushing riffs together with complex precision.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/rain-city-doom-fest-2026-18-dec"
  ]
 },
 {
  "id": "wrung",
  "name": "Wrung",
  "city": "PNW",
  "genres": [
   "metal",
   "rock"
  ],
  "active": "Booked at El Corazon / Funhouse, 2026-12-11",
  "socials": {
   "instagram": "https://www.instagram.com/wrung.wav",
   "tiktok": "",
   "spotify": "",
   "bandcamp": "",
   "youtube": "https://www.youtube.com/@WRUNG.wav222",
   "website": "https://www.thebandwrung.com/",
   "facebook": ""
  },
  "followers": {
   "instagram": null,
   "seenOn": ""
  },
  "soundsLike": "BASED IN THE PNW, WRUNG IS A GLOOMY METAL INFLUENCED ALT ROCK BAND (FFO DEFTONES, NORTHLANE AND MOODRING) ESTABLISHED IN 2024 AND HAD THEIR LIVE DEBUT IN DECEMBER OF 2025.",
  "playsAt": [
   "El Corazon / Funhouse"
  ],
  "notes": "",
  "sources": [
   "https://www.elcorazonseattle.com/shows/missio-love-heartbreak-tour-11-dec"
  ]
 }
];
