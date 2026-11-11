type ExerciseEn = {
  name: string;
  muscle: string;
  level: string;
  equipment: string;
  duration?: string;
  reps?: string;
  description: string;
  instructions: string[];
};

export const EXERCISES_EN: Record<string, ExerciseEn> = {
  'bodyweight-squat': {
    name: 'Bodyweight Squat',
    muscle: 'Quads and glutes',
    level: 'Beginner',
    equipment: 'No equipment',
    duration: '30 seconds',
    description: 'A foundational exercise for strengthening the lower body and improving stability.',
    instructions: [
      'Stand with your feet shoulder-width apart and your back neutral.',
      'Push your hips back and bend your knees, keeping them in line with your toes.',
      'Stand up by pushing through the floor without locking your knees, and stop if you feel sharp pain.'
    ]
  },
  'reverse-lunge': {
    name: 'Reverse Lunge',
    muscle: 'Quads and glutes',
    level: 'Beginner',
    equipment: 'No equipment',
    duration: '40 seconds',
    reps: '10 per leg',
    description: 'A balanced move that strengthens the legs with less pressure on the knee.',
    instructions: [
      'Start standing with your feet parallel and your chest lifted.',
      'Step one leg back and lower until the knee nears the floor without touching it.',
      'Push through the front leg to return, keeping the knee in line with your toes.'
    ]
  },
  'glute-bridge': {
    name: 'Glute Bridge',
    muscle: 'Glutes and hamstrings',
    level: 'Beginner',
    equipment: 'No equipment',
    duration: '30 seconds',
    description: 'A floor exercise that activates the glutes and supports the lower back.',
    instructions: [
      'Lie on your back with your feet planted and your knees bent.',
      'Lift your hips until your body forms a straight line, and gently squeeze your glutes.',
      'Lower slowly, and avoid driving the movement from your lower back or holding your breath.'
    ]
  },
  'push-up': {
    name: 'Push-Up',
    muscle: 'Chest, shoulders and arms',
    level: 'Intermediate',
    equipment: 'No equipment',
    duration: '40 seconds',
    description: 'A compound upper-body exercise that can be modified on the knees.',
    instructions: [
      'Place your hands under your shoulders and keep your body in a straight line.',
      'Bend your elbows to a comfortable angle while keeping your core tight.',
      'Push the floor away to return, and stop before your back loses its neutral position.'
    ]
  },
  'knee-push-up': {
    name: 'Knee Push-Up',
    muscle: 'Chest and arms',
    level: 'Beginner',
    equipment: 'No equipment',
    duration: '35 seconds',
    description: 'An easier push-up variation for building strength gradually.',
    instructions: [
      'Place your knees on the floor and your hands slightly wider than your shoulders.',
      'Keep a straight line from your knees to your head as you lower.',
      'Push back up slowly, keeping your elbows relatively close to your torso.'
    ]
  },
  'plank': {
    name: 'Front Plank',
    muscle: 'Abs and core',
    level: 'Beginner',
    equipment: 'No equipment',
    duration: '30-45 seconds',
    reps: 'Hold',
    description: 'A full-core hold that improves body-position control.',
    instructions: [
      'Rest on your forearms and toes, with your shoulders directly above your elbows.',
      'Brace your abs and glutes and keep your back neutral.',
      'Breathe calmly, and lower your knees if your hips begin to sink or rise.'
    ]
  },
  'side-plank': {
    name: 'Side Plank',
    muscle: 'Obliques and core',
    level: 'Intermediate',
    equipment: 'No equipment',
    duration: '20-30 seconds per side',
    reps: 'Hold',
    description: 'Strengthens the side muscles and helps stabilize the pelvis.',
    instructions: [
      'Place your elbow directly under your shoulder and rest on the side of your foot or knee.',
      'Lift your hips and keep your body in a straight line.',
      "Don't let your shoulder collapse forward, and breathe steadily throughout the hold."
    ]
  },
  'mountain-climber': {
    name: 'Mountain Climber',
    muscle: 'Core, shoulders and legs',
    level: 'Intermediate',
    equipment: 'No equipment',
    duration: '30 seconds',
    reps: '20 alternating reps',
    description: 'A dynamic move that raises your heart rate and trains the core.',
    instructions: [
      'Start in a push-up position with your hands under your shoulders.',
      'Drive one knee toward your chest, then switch legs at a controlled pace.',
      'Keep your hips steady, and slow down if you lose control.'
    ]
  },
  'jumping-jacks': {
    name: 'Jumping Jacks',
    muscle: 'Full body and cardio',
    level: 'Beginner',
    equipment: 'No equipment',
    duration: '30 seconds',
    description: 'A simple cardio warm-up to raise body temperature.',
    instructions: [
      'Start with your feet together and your arms at your sides.',
      'Jump your feet apart and raise your arms, without overextending your range.',
      'Land softly on the balls of your feet with a slight bend in your knees.'
    ]
  },
  'high-knees': {
    name: 'High Knees',
    muscle: 'Quads, core and cardio',
    level: 'Beginner',
    equipment: 'No equipment',
    duration: '30 seconds',
    reps: '30 alternating reps',
    description: 'A short HIIT exercise to improve agility and raise your heart rate.',
    instructions: [
      'Stand tall, brace your core and keep your eyes forward.',
      'Alternate lifting your knees to a comfortable height while swinging your arms.',
      'Land lightly, and lower the height if you feel pressure in your knees.'
    ]
  },
  'burpee': {
    name: 'Modified Burpee',
    muscle: 'Full body and cardio',
    level: 'Advanced',
    equipment: 'No equipment',
    duration: '30 seconds',
    description: 'A compound HIIT exercise combining a squat, a plank and a stand.',
    instructions: [
      'Drop into a squat and place your hands on the floor without rounding your back.',
      'Step or jump your feet back into a stable position.',
      'Return to standing and rise smoothly; you can skip the jump to reduce the load.'
    ]
  },
  'dead-bug': {
    name: 'Dead Bug',
    muscle: 'Abs and deep core',
    level: 'Beginner',
    equipment: 'No equipment',
    duration: '40 seconds',
    reps: '8 per side',
    description: 'A core-control exercise that supports the lower back.',
    instructions: [
      'Lie down and raise your arms and knees to a right angle.',
      'Slowly extend the opposite arm and leg while keeping your lower back close to the floor.',
      'Return to the start and switch sides, without holding your breath or rushing.'
    ]
  },
  'superman': {
    name: 'Superman',
    muscle: 'Lower back, glutes and shoulders',
    level: 'Beginner',
    equipment: 'No equipment',
    duration: '30 seconds',
    description: 'Gentle strengthening for the back of the body with a focus on control.',
    instructions: [
      'Lie face down and extend your arms in front of you without straining your neck.',
      'Lift your arms and legs slightly while gently squeezing your glutes.',
      'Hold for a moment, then lower slowly, and stop if you feel any back pain.'
    ]
  },
  'dumbbell-goblet-squat': {
    name: 'Goblet Squat',
    muscle: 'Quads, glutes and core',
    level: 'Intermediate',
    equipment: 'One dumbbell',
    duration: '45 seconds',
    description: 'A weighted squat suitable for the gym or home with a dumbbell.',
    instructions: [
      'Hold the dumbbell in front of your chest with both hands and keep your shoulders steady.',
      'Lower by sending your hips back, with your chest up and your knees tracking over your feet.',
      "Stand up by pressing your feet into the floor, and don't let the weight pull you forward."
    ]
  },
  'dumbbell-row': {
    name: 'Bent-Over Dumbbell Row',
    muscle: 'Back and biceps',
    level: 'Intermediate',
    equipment: 'Dumbbells',
    duration: '45 seconds',
    description: 'A pulling exercise to improve back strength and shoulder posture.',
    instructions: [
      'Hinge at the hips with a neutral back and let your arms hang below your shoulders.',
      'Pull the dumbbells toward the sides of your ribcage while squeezing your shoulder blades together.',
      'Lower the weights slowly, and avoid twisting your torso or shrugging your shoulders.'
    ]
  },
  'dumbbell-shoulder-press': {
    name: 'Dumbbell Shoulder Press',
    muscle: 'Shoulders and arms',
    level: 'Intermediate',
    equipment: 'Dumbbells',
    duration: '40 seconds',
    description: 'A vertical press to build shoulder strength with a controlled weight.',
    instructions: [
      'Start with the dumbbells at shoulder level and your wrists straight.',
      'Press upward without arching your lower back or pushing your head forward.',
      'Lower slowly to a comfortable level, and stop if you feel shoulder pain.'
    ]
  },
  'dumbbell-deadlift': {
    name: 'Dumbbell Deadlift',
    muscle: 'Glutes, hamstrings and back',
    level: 'Intermediate',
    equipment: 'Dumbbells',
    duration: '45 seconds',
    description: 'A hip-hinge movement that strengthens the posterior chain.',
    instructions: [
      'Place the dumbbells in front of your thighs with your feet hip-width apart.',
      'Push your hips back, keeping the dumbbells close to your legs and your back neutral.',
      'Extend your hips to stand and squeeze your glutes, without leaning back.'
    ]
  },
  'leg-press': {
    name: 'Leg Press',
    muscle: 'Quads and glutes',
    level: 'Intermediate',
    equipment: 'Leg press machine',
    duration: '45 seconds',
    description: 'A stable gym exercise for strengthening the lower body with back support.',
    instructions: [
      'Adjust the seat so your lower back stays flat against the pad.',
      'Push the platform with your feet at a comfortable width, without locking your knees.',
      'Lower the weight slowly within a range that keeps your hips on the seat.'
    ]
  },
  'lat-pulldown': {
    name: 'Lat Pulldown',
    muscle: 'Back and arms',
    level: 'Beginner',
    equipment: 'Lat pulldown machine',
    duration: '45 seconds',
    description: 'A vertical pulling exercise to build the back and improve shoulder control.',
    instructions: [
      'Sit firmly and grip the bar slightly wider than your shoulders.',
      'Pull the bar toward your upper chest while keeping your shoulders down.',
      'Return the bar slowly, and never pull it behind your neck.'
    ]
  },
  'cable-chest-press': {
    name: 'Cable Chest Press',
    muscle: 'Chest, shoulders and arms',
    level: 'Intermediate',
    equipment: 'Cable machine',
    duration: '45 seconds',
    description: 'A horizontal press with constant resistance to strengthen the chest.',
    instructions: [
      'Stand firmly with your feet slightly apart and the handles at chest level.',
      "Press the handles forward without raising your shoulders or arching your back.",
      "Return slowly until you feel a comfortable stretch, and don't let the weights slam."
    ]
  },
  'kettlebell-swing': {
    name: 'Kettlebell Swing',
    muscle: 'Glutes, hamstrings and core',
    level: 'Advanced',
    equipment: 'Kettlebell',
    duration: '30 seconds',
    description: 'A powerful, explosive move driven by the hips rather than lifting with the arms.',
    instructions: [
      'Start with the kettlebell in front of you and push your hips back with a neutral back.',
      'Swing the weight between your legs, then drive your hips forward so it reaches chest height.',
      "Let the weight float back with the momentum, and don't lift with your arms alone or round your back."
    ]
  },
  'rowing-machine': {
    name: 'Rowing Machine',
    muscle: 'Back, legs and cardio',
    level: 'Intermediate',
    equipment: 'Rowing machine',
    duration: '5 minutes',
    reps: '500 meters',
    description: 'A full-body cardio exercise suited to steady or interval efforts.',
    instructions: [
      'Start by driving with your legs, then open your hips and pull the handle to your lower chest.',
      'Keep a long back and your elbows close to your body.',
      'Reverse the sequence smoothly: arms, then hips, then knees, without rushing.'
    ]
  },
  'stationary-bike-hiit': {
    name: 'Stationary Bike Intervals',
    muscle: 'Legs and cardio',
    level: 'Intermediate',
    equipment: 'Stationary bike',
    duration: '12 minutes',
    reps: '30 seconds fast + 60 seconds easy',
    description: 'A relatively low-impact HIIT session to improve cardio fitness.',
    instructions: [
      'Adjust the seat so your knee stays slightly bent at the bottom of the pedal stroke.',
      'Begin with an easy warm-up, then gradually increase resistance or speed during the fast intervals.',
      'Ease the pace during recovery and avoid stopping abruptly, and stop if you feel dizzy or unusual pain.'
    ]
  },
  'treadmill-walk-jog': {
    name: 'Treadmill Walk and Jog',
    muscle: 'Legs and cardio',
    level: 'Beginner',
    equipment: 'Electric treadmill',
    duration: '20 minutes',
    reps: '2 minutes walking + 3 minutes jogging',
    description: 'A simple cardio progression to build endurance without an intense start.',
    instructions: [
      'Start at a comfortable walking speed and make sure the safety clip is attached.',
      'Increase the speed gradually and land lightly with your eyes forward.',
      'Use the handrails only when needed, and slow down before stepping off.'
    ]
  }
};

export const FOODS_EN: Record<string, { name: string; serving: string }> = {
  'oats': { name: 'Cooked Oats', serving: '1 cup (234 g)' },
  'eggs': { name: 'Boiled Eggs', serving: '2 large eggs (100 g)' },
  'chicken-breast': { name: 'Grilled Chicken Breast', serving: '150 g' },
  'turkey-breast': { name: 'Sliced Turkey Breast', serving: '100 g' },
  'lean-beef': { name: 'Lean Beef', serving: '120 g cooked' },
  'salmon': { name: 'Grilled Salmon', serving: '120 g' },
  'tuna': { name: 'Canned Tuna in Water', serving: '1 drained can (120 g)' },
  'lentils': { name: 'Cooked Lentils', serving: '1 cup (198 g)' },
  'chickpeas': { name: 'Cooked Chickpeas', serving: '1 cup (164 g)' },
  'beans': { name: 'Cooked Kidney Beans', serving: '1 cup (177 g)' },
  'greek-yogurt': { name: 'Low-Fat Greek Yogurt', serving: '170 g' },
  'milk': { name: 'Low-Fat Milk', serving: '1 cup (240 ml)' },
  'cottage-cheese': { name: 'Cottage Cheese', serving: '1/2 cup (113 g)' },
  'brown-rice': { name: 'Cooked Brown Rice', serving: '1 cup (195 g)' },
  'white-rice': { name: 'Cooked White Rice', serving: '1 cup (158 g)' },
  'quinoa': { name: 'Cooked Quinoa', serving: '1 cup (185 g)' },
  'sweet-potato': { name: 'Baked Sweet Potato', serving: '1 medium (130 g)' },
  'whole-wheat-bread': { name: 'Whole Wheat Bread', serving: '2 slices (60 g)' },
  'banana': { name: 'Banana', serving: '1 medium (118 g)' },
  'apple': { name: 'Apple', serving: '1 medium (182 g)' },
  'orange': { name: 'Orange', serving: '1 medium (131 g)' },
  'avocado': { name: 'Avocado', serving: '1/2 fruit (100 g)' },
  'almonds': { name: 'Almonds', serving: 'small handful (28 g)' },
  'peanut-butter': { name: 'Peanut Butter', serving: '2 tbsp (32 g)' },
  'olive-oil': { name: 'Olive Oil', serving: '1 tbsp (15 ml)' }
};
