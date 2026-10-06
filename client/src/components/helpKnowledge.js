const helpArticles = [
  {
    id: 'overview',
    title: 'ChargerHub overview',
    keywords: ['ChargerHub app features map stations electric vehicle charging wallet trips shop Buzz admin simulator support'],
    phrases: ['what can you do', 'what does this app do', 'tell me about the app', 'show me all features', 'what features are available'],
    answer: 'ChargerHub helps you find charging stations, save stations, choose a connector, estimate and track a charging session, manage a wallet, reserve a connector, plan and save trips, browse the EV shop, and read ChargerHub Buzz posts. Admins also have a simulator console for station and connector status. Ask me about any screen or feature and I’ll explain how it works.'
  },
  {
    id: 'google-login',
    title: 'Sign-in and accounts',
    keywords: ['login log in sign in Google account Firebase authentication authorized domain popup sign out logout password account access'],
    phrases: ['how do I log in', 'how do I sign in', 'Google sign in is not working', 'how do I log out', 'why is login failing'],
    answer: 'You can create an account with your name, email, phone number, and password, or sign in with an existing email/password account. You can also use the Google sign-in button. Accept the Terms and Conditions and Privacy Policy to continue. Use Logout from Profile to sign out.'
  },
  {
    id: 'phone-otp',
    title: 'Phone OTP',
    keywords: ['phone number mobile OTP SMS text message one time password verification code billing Firebase phone auth'],
    phrases: ['where is my otp', 'send me a code', 'why do I not get an sms', 'can I log in with my phone'],
    answer: 'The phone number on signup is saved as profile information; it is not verified by SMS and no OTP is sent. You can sign in with your email and password or use Google sign-in.'
  },
  {
    id: 'phone-support',
    title: 'Phone support and Help',
    keywords: ['helpline help line call phone number customer care human support automatic answering AI voice assistant escalate handoff'],
    phrases: ['can AI answer a phone call', 'will the helpline answer my call', 'what is the support phone number', 'escalate to admin', 'talk to a human'],
    answer: 'This project does not have a real support phone number or automatic phone answering configured. In Help, choose Talk to Admin to send a support request from the app. The request appears in the Admin Console; it is not a live phone call.'
  },
  {
    id: 'firebase-setup',
    title: 'Firebase sign-in errors',
    keywords: ['Firebase API key invalid api-key-not-valid auth domain app id project id client env Render deployment build billing unauthorized domain service account secret'],
    phrases: ['auth api key not valid', 'Firebase billing not enabled', 'Google login gives an error', 'Firebase settings are wrong'],
    answer: 'For email/password sign-in, check that you entered the same email and password used at signup. For Google sign-in, choose the correct Google account and allow pop-ups. If sign-in still fails, copy the exact error message and contact ChargerHub support.'
  },
  {
    id: 'demo-login',
    title: 'Demo access',
    keywords: ['demo quick demo user admin login test account sample'],
    phrases: ['how do I use demo mode', 'where is the demo account', 'how do I open admin'],
    answer: 'Sign in with your email and password or use Google. Admin features are available only to Firebase accounts that the ChargerHub administrator has authorized in the project.'
  },
  {
    id: 'vehicle-setup',
    title: 'Add or change a vehicle',
    keywords: ['vehicle car EV electric scooter bike motorcycle two wheeler three wheeler Tata MG BMW model registration number plate primary battery capacity connector setup onboarding'],
    phrases: ['how do I add a vehicle', 'how do I change my car', 'why can I not see the map after login', 'how do I add my registration number'],
    answer: 'Choose a vehicle model in Vehicle Setup, then enter its registration number. A first-time user with no saved vehicle is asked to complete this step before opening the main app. To add or manage another vehicle later, open Profile → Vehicle. The selected primary vehicle is used for charging and trip battery estimates.'
  },
  {
    id: 'profile',
    title: 'Profile and account options',
    keywords: ['profile account settings name email phone sessions history saved trips orders reservations vehicle saved stations logout devices privacy address help'],
    phrases: ['what is in my profile', 'where do I find my history', 'where are account settings'],
    answer: 'Profile lets you view charging sessions, offers, registered vehicles, reservations, saved stations, orders, saved trips, account privacy information, and the current signed-in device. It also shows your wallet balance and Help.'
  },
  {
    id: 'map-stations',
    title: 'Map and finding stations',
    keywords: ['map station stations charger hub charging location nearby find search list pins map view recenter refresh Pune'],
    phrases: ['how do I find a charger', 'where are nearby charging stations', 'how do I search the map', 'map is empty'],
    answer: 'Open Map from the bottom navigation. Search by a charger or station name, select a station card or map pin for details, and use the map/list switch to change the view. The map starts with a Pune preview and attempts to use your live location. Allow location access and use the recenter control to move the map to your location.'
  },
  {
    id: 'location',
    title: 'Location permission',
    keywords: ['location GPS geolocation current location permission allow browser blocked denied map location Pune preview'],
    phrases: ['how do I enable location', 'the app cannot find my location', 'why is my starting location wrong'],
    answer: 'Allow location access when the browser asks. If you denied it, open the browser’s site permissions, allow Location, then reload ChargerHub and use the map’s recenter button. If live location is unavailable, the map can show a Pune preview; Trips also lets you type a starting address.'
  },
  {
    id: 'map-filters',
    title: 'Map filters',
    keywords: ['filter available fast charger DC AC offers offer available only quick charger search map'],
    phrases: ['how do I filter stations', 'show only available chargers', 'find a fast charger', 'filter chargers by type'],
    answer: 'On Map, use Available to show available connectors, Fast charger to narrow the results, and Offers to view stations with offers when the station data includes them. The Plan Trip shortcut opens Trips. A station’s detail page also has filters for available connectors and AC or DC.'
  },
  {
    id: 'station-details',
    title: 'Station details',
    keywords: ['station detail address rating reviews about charger amenities facilities restroom cafe WiFi parking open hours public guidelines save bookmark favorite'],
    phrases: ['what details are on a station page', 'how do I save a station', 'how do I see station facilities'],
    answer: 'Select a station from the map or list to open its detail page. It shows station information and charger connectors, with sections for station information, amenities, and reviews. Use the bookmark button to save or unsave a station. Connector availability and station information depend on the project data.'
  },
  {
    id: 'connectors',
    title: 'Connectors and AC/DC',
    keywords: ['connector plug AC DC current type power kW charger cable fast charger compatibility vehicle connector'],
    phrases: ['which connector should I choose', 'what is AC versus DC', 'why is a connector unavailable'],
    answer: 'A station can list several connectors with a connector type, AC or DC current type, power in kW, price, and status. Choose an Available connector that matches your vehicle. Unavailable connectors cannot be selected. The vehicle’s saved connector information can help you check compatibility.'
  },
  {
    id: 'saved-stations',
    title: 'Saved stations',
    keywords: ['saved station bookmark favorite favorites location station profile'],
    phrases: ['where are my favorite stations', 'how do I bookmark a charger'],
    answer: 'Open a station and tap its bookmark icon to save it. Profile → Saved Stations is the shortcut provided for saved charging locations. If the map does not filter to your saved list in this build, use the station bookmark and map view; that shortcut is still limited.'
  },
  {
    id: 'reservations',
    title: 'Reserve a connector',
    keywords: ['reservation reserve book booking connector slot time minutes 15 30 45 cancel upcoming'],
    phrases: ['how do I book a charging slot', 'how can I reserve a charger', 'how do I cancel a reservation'],
    answer: 'Open a station, select an available connector, and choose Reserve. Select a 15, 30, or 45-minute reservation duration and confirm. Your booking appears in the Reservations list in Profile. You can cancel an active reservation there.'
  },
  {
    id: 'charging-setup',
    title: 'Choose a charging target',
    keywords: ['charging charge charger start session percentage percent battery amount rupees money units kWh energy time minutes estimate calculation'],
    phrases: ['how do I start charging', 'how do I choose how much to charge', 'charge to a percentage', 'charge for a certain amount'],
    answer: 'Choose a station and connector, then pick a charging target: Percentage, Amount in rupees, Units in kWh, or Time in minutes. ChargerHub calculates estimated energy, time, and cost from the connector and vehicle details before you start. Make sure your wallet has enough balance.'
  },
  {
    id: 'charging-progress',
    title: 'Charging progress and stopping',
    keywords: ['active session live progress battery percentage SoC energy delivered kWh power kW cost stop finish receipt history charging'],
    phrases: ['how do I stop charging', 'charging progress is not moving', 'where is my charging receipt', 'how much did charging cost'],
    answer: 'During an active session, the screen shows battery percentage, delivered energy, charging power, and estimated cost. Use Stop Charging to finish early; the confirmation receipt shows energy, final battery level, green kilometres, and the amount deducted. Session records can be found from Profile → Sessions or in Wallet activity.'
  },
  {
    id: 'hardware-simulation',
    title: 'Real charger versus simulation',
    keywords: ['real physical hardware ESP32 Arduino circuit switch relay charger simulator simulation software telemetry OCPP vehicle real world charging'],
    phrases: ['does the app turn on a real charger', 'how do I connect an ESP32', 'why is the charger only simulated', 'is this real charging', 'why is my charger not turning on', 'charger does not switch on'],
    answer: 'The current project simulates charging and charger status in software. It does not switch on an ESP32 or physical charger by itself. Real hardware needs compatible charging equipment installed and connected by the project team; pressing a button in this demo does not energize a real charger.'
  },
  {
    id: 'wallet',
    title: 'Wallet balance and history',
    keywords: ['wallet balance money credits transactions activity history debit credit coins rupees top up charging deduction'],
    phrases: ['where can I see my balance', 'why was money deducted', 'where are wallet transactions', 'what are wallet coins'],
    answer: 'Open Wallet to see your cash balance, ChargerHub Coins, and dated transactions. A successful charging session can add a debit entry; a successful top-up adds a credit entry. Coins are shown separately from the rupee balance.'
  },
  {
    id: 'top-up',
    title: 'Add wallet credits with Razorpay',
    keywords: ['add credits topup top up recharge razorpay checkout payment UPI card payment gateway cash wallet'],
    phrases: ['how do I add money to wallet', 'how do I top up credits', 'how do I pay with Razorpay'],
    answer: 'Open Wallet and tap Add Credits, then follow the payment steps shown. If checkout does not open, first check your internet connection and try again. If your payment succeeds but the wallet balance does not update, keep the payment confirmation or transaction reference and contact your project administrator. You do not need to change any technical settings.'
  },
  {
    id: 'razorpay-mode',
    title: 'Razorpay test and live mode',
    keywords: ['Razorpay test mode live mode key id secret payment production real money deploy Render credentials'],
    phrases: ['why is Razorpay in test mode', 'test payment is not working', 'how do I accept real payments'],
    answer: 'If Razorpay says Test Mode, the payment is a test and does not collect real money. For a real payment, ask your project administrator whether live payments are enabled. Do not enter real payment details into a test checkout.'
  },
  {
    id: 'trips-plan',
    title: 'Plan a trip',
    keywords: ['trip plan route planner origin start location address destination distance drive time estimated battery consumption range detour charging stop station'],
    phrases: ['how do I plan a route', 'how do I find chargers along my trip', 'how do I change the starting point'],
    answer: 'Open Trips or choose Plan Trip on Map. Use Current location as the start if location permission is available, or type a starting address. Enter a destination and calculate the route. You can adjust the detour distance for suggested ChargerHub stops. Route time and battery use are estimates and do not include live traffic or road conditions.'
  },
  {
    id: 'trip-battery',
    title: 'Trip battery and charging stops',
    keywords: ['battery range state of charge SoC consumption remaining battery percent energy kWh en route station stop charger detour'],
    phrases: ['will my battery last the trip', 'how does trip battery use work', 'where are recommended charging stops'],
    answer: 'Trip results estimate battery use using your selected vehicle and show whether en-route charging is recommended. They can list ChargerHub stations near the route within your chosen detour distance. These are estimates, not live traffic, live charger telemetry, or a guarantee that a station is available when you arrive.'
  },
  {
    id: 'trip-save-navigation',
    title: 'Save a trip and navigate',
    keywords: ['save saved trip trips navigation navigate directions Google Maps open external route saved destination account'],
    phrases: ['where did my trip save', 'how do I start navigation', 'how do I open a saved trip'],
    answer: 'After calculating a route, tap Save Trip. Saved routes are stored with your account and shown in the Saved trips section in Trips or from Profile → Saved Trips. Start Navigation opens the route in Google Maps in a new tab or app.'
  },
  {
    id: 'shop-products',
    title: 'Shop products',
    keywords: ['shop store products home charger portable charger RFID category price stock accessories buy ChargerHub'],
    phrases: ['what can I buy in the shop', 'where are home chargers', 'how do I find a product'],
    answer: 'Open Shop from the bottom navigation. The shop is being prepared and currently has no products available. Please check back soon.'
  },
  {
    id: 'shop-orders',
    title: 'Place and find a shop order',
    keywords: ['shop order buy purchase checkout delivery shipping address order confirmation order history reference'],
    phrases: ['how do I place an order', 'where are my shop orders', 'how do I change delivery address'],
    answer: 'New shop orders are unavailable while the shop has no products. You can still open Profile → Orders to review existing order history. Shop orders are separate from Razorpay wallet top-ups.'
  },
  {
    id: 'buzz-feed',
    title: 'ChargerHub Buzz',
    keywords: ['Buzz ChargerHub community social feed post posts offer offers tag hashtag trips discover like heart comment reply share save bookmark admin publish photo caption route distance travel charging stops completed planned journey'],
    phrases: ['what is Buzz', 'where can I see offers', 'how do I like a post', 'how do I save a Buzz post', 'who can publish Buzz posts', 'how do I share my trip'],
    answer: 'Open Buzz → Discover to browse posts. Only verified admins can publish ChargerHub announcements. On #Trips, any signed-in user can share a planned or completed journey with its starting point, destination, distance, travel time, and charging stops. All signed-in users can like, comment, reply, share, or save posts. Open Saved Posts to find your saved items.'
  },
  {
    id: 'admin-console',
    title: 'Admin and simulator console',
    keywords: ['admin console administrator metrics users revenue stations connectors fleet sessions simulator refresh status available busy offline faulted'],
    phrases: ['what can an admin do', 'how do I change charger status', 'how do I see active charging sessions'],
    answer: 'The Admin & Simulator Console is for admin accounts. It shows platform metrics, stations and connectors, charging sessions, and registered users. An admin can change a connector’s demo status—Available, Busy, Offline, or Faulted—and refresh the data. Those status changes are software/demo controls unless physical charger hardware has been separately connected.'
  },
  {
    id: 'server-connection',
    title: 'Request failed or server connection',
    keywords: ['request failed unable connect server backend API Render ECONNREFUSED proxy error service offline health check VITE_API_BASE_URL network login catalog'],
    phrases: ['request failed after login', 'server connection refused', 'vehicles catalog will not load', 'website cannot reach backend'],
    answer: 'If you see “Request failed” or “Unable to connect,” check your internet connection, refresh the page, and try again after a short wait. If it keeps happening, take a screenshot of the message and send it to your project administrator; they will check the service.'
  },
  {
    id: 'maps-errors',
    title: 'Map or station list problems',
    keywords: ['map blank empty no stations nearby location permission map tiles OSM refresh stations not loading'],
    phrases: ['stations are not showing', 'map is blank', 'nearby chargers do not appear'],
    answer: 'Allow location access, clear the map search, turn off any active filters, then refresh or recenter the map. The map can only show stations available in ChargerHub. If it remains blank, refresh the page and send your project administrator your approximate area and a screenshot.'
  },
  {
    id: 'current-limitations',
    title: 'Demo features and limitations',
    keywords: ['not working placeholder demo fake simulated unfinished real live traffic saved list profile tiles phone calls physical charger real payment current limitation'],
    phrases: ['which features are only demos', 'is everything connected', 'does help answer account information'],
    answer: 'Some parts are demonstrators rather than live services: charger progress and admin hardware status are software simulations; trip time and battery use are estimates; the shop is currently unavailable; and several Profile/Buzz controls are placeholders. This help guide explains the app but cannot see your private account, make a payment, change settings, or answer phone calls.'
  }
];

const stopWords = new Set([
  'a', 'about', 'an', 'and', 'are', 'as', 'at', 'be', 'can', 'could', 'do', 'does', 'for', 'from', 'get', 'give',
  'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'please', 'show', 'tell', 'the', 'this', 'to', 'what',
  'when', 'where', 'which', 'why', 'with', 'would', 'you', 'your', 'app', 'chargerhub'
]);

const synonymGroups = [
  ['vehicle', 'vehicles', 'car', 'cars', 'ev', 'bike', 'scooter', 'motorcycle'],
  ['login', 'log in', 'sign in', 'signin', 'authentication', 'auth'],
  ['otp', 'sms', 'verification code', 'one time password'],
  ['wallet', 'balance', 'credits', 'top up', 'topup', 'recharge'],
  ['reservation', 'reservations', 'reserve', 'booking', 'book', 'slot'],
  ['trip', 'trips', 'route', 'navigation', 'navigate', 'directions', 'google maps'],
  ['charging', 'charge', 'charger', 'charging session', 'session'],
  ['station', 'stations', 'charging station', 'charging stations', 'charging hub'],
  ['shop', 'product', 'products', 'order', 'orders', 'purchase'],
  ['buzz', 'post', 'posts', 'community', 'feed'],
  ['simulator', 'simulation', 'hardware', 'esp32', 'telemetry']
];

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9%₹]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningfulTokens(value) {
  return normalize(value).split(' ').filter((token) => token && !stopWords.has(token));
}

function expandQuestion(question) {
  const normalized = normalize(question);
  const tokens = new Set(meaningfulTokens(question));

  synonymGroups.forEach((group) => {
    const groupMatches = group.some((term) => term.includes(' ')
      ? normalized.includes(term)
      : tokens.has(term));
    if (groupMatches) group.forEach((term) => meaningfulTokens(term).forEach((token) => tokens.add(token)));
  });

  return tokens;
}

const documentFrequencies = (() => {
  const frequencies = new Map();
  helpArticles.forEach((article) => {
    const articleTokens = new Set(meaningfulTokens([...article.keywords, ...article.phrases].join(' ')));
    articleTokens.forEach((token) => frequencies.set(token, (frequencies.get(token) || 0) + 1));
  });
  return frequencies;
})();

function scoreArticle(question, tokens, article) {
  const normalizedQuestion = normalize(question);
  const articleTokens = new Set(meaningfulTokens([...article.keywords, ...article.phrases].join(' ')));
  let score = 0;

  tokens.forEach((token) => {
    if (!articleTokens.has(token)) return;
    const frequency = documentFrequencies.get(token) || 1;
    score += 1 + Math.log((helpArticles.length + 1) / (frequency + 1));
  });

  if (article.phrases.some((phrase) => normalizedQuestion.includes(normalize(phrase)))) score += 3.5;
  return score;
}

function bestArticle(question) {
  const tokens = expandQuestion(question);
  if (tokens.size === 0) return null;

  const ranked = helpArticles
    .filter((article) => article.id !== 'overview')
    .map((article) => ({ article, score: scoreArticle(question, tokens, article) }))
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.score >= 1.4 ? ranked[0].article : null;
}

const overviewAnswer = helpArticles.find((article) => article.id === 'overview').answer;

export function answerAppHelp(question) {
  const normalized = normalize(question);
  if (!normalized) {
    return 'Ask me anything about ChargerHub: accounts, vehicles, maps and stations, connectors, reservations, charging, wallet and payments, trips, Shop, Buzz, or the admin simulator.';
  }

  if (/\b(what can you do|what does this app do|tell me about the app|all features|everything about chargerhub|app overview)\b/.test(normalized)) {
    return overviewAnswer;
  }

  if (/^(hi|hello|hey|good morning|good afternoon|good evening)$/.test(normalized)) {
    return 'Hi! I can explain any part of ChargerHub, including accounts, vehicles, stations, reservations, charging, wallet and payments, trips, Shop, Buzz, and the admin simulator. What would you like to know?';
  }

  const segments = question
    .split(/\b(?:and|also|plus|then)\b|[,;]+/i)
    .map((segment) => segment.trim())
    .filter((segment) => meaningfulTokens(segment).length >= 2);
  const questions = segments.length > 1 ? segments : [question];
  const matches = [];

  questions.forEach((segment) => {
    const article = bestArticle(segment);
    if (article && !matches.some((match) => match.id === article.id)) matches.push(article);
  });

  if (matches.length === 0) {
    const article = bestArticle(question);
    if (article) matches.push(article);
  }

  if (matches.length === 0) {
    return 'I can answer questions about every current ChargerHub area: sign-in, vehicles, stations and the map, connectors, reservations, charging, wallet and Razorpay, trips, Shop, Buzz, Profile, and the admin simulator. Tell me which screen you are on and what you are trying to do, or paste the error message. If you want a person to review it, choose Talk to Admin below.';
  }

  return matches.slice(0, 3).map((article) => matches.length > 1
    ? `${article.title}: ${article.answer}`
    : article.answer).join('\n\n');
}

export const helpSuggestions = [
  'What can I do in ChargerHub?',
  'How do I add my vehicle?',
  'How do I reserve a charger?',
  'Why is my charger not turning on?',
  'How do I add wallet credits?',
  'How do I save and navigate a trip?'
];

