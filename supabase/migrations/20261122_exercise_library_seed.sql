-- VORA: content seed for muscle knowledge (free tier) and the exercise library (premium).
-- Depends on 20261121_exercise_library.sql (tables public.muscles and public.exercise_library).
--
-- CONTENT NOTICE
--   * All Arabic and English text below is ORIGINAL WORDING written from general exercise-science knowledge.
--     It is not copied from any website, book or training programme, and it reproduces no copyrighted programme.
--   * The `sources` column names reputable references that cover the subject matter (resistance-training
--     technique, safety and set/rep/rest guidance). They are given as a basis / further reading ONLY.
--     They are NOT an endorsement: none of these organisations has reviewed, approved or is affiliated with
--     this content. The textbook / position-stand entries refer to general principles and are not a claim
--     that the reference describes that exact exercise. A deep link to an ACE Exercise Library page is
--     included only where that page was opened and its key technique / safety points were compared with our
--     text when this file was written; every other row links only to the library root.
--   * Every row has review_status = 'unreviewed': NO qualified professional has reviewed this content yet.
--     Do not set 'reviewed' until a qualified human professional has actually reviewed the row.
--   * Guidance is general education for healthy adults, not medical advice.
--
-- Idempotent: safe to re-run (upserts by id). NOTE: a re-run overwrites the text of these rows with the seed
-- wording and therefore also resets review_status to 'unreviewed' (a review applies to the reviewed wording). Timed holds use seconds in default_reps, e.g. '20-40s'.

begin;

-- ---------------------------------------------------------------------------------------------------
-- Muscles (9 rows)
-- ---------------------------------------------------------------------------------------------------
insert into public.muscles
  (id, name_ar, name_en, location_ar, location_en, function_ar, function_en, summary_ar, summary_en, sort_order)
values
  ('back', 'الظهر', 'Back',
   'يغطي الجهة الخلفية من الجذع من أسفل الرقبة إلى الخصر، ويشمل العضلة العريضة (اللاتس) على الجانبين، والعضلات بين لوحي الكتف، وعضلات أسفل الظهر.',
   'Covers the rear of the torso from the base of the neck to the waist: the lats along the sides, the muscles between the shoulder blades, and the lower-back muscles.',
   'تسحب الذراعين للأسفل وللخلف، وتضمّ لوحي الكتف، وتساعد على إبقاء العمود الفقري مستقيماً.',
   'Pulls the arms down and back, draws the shoulder blades together, and helps hold the spine upright.',
   'ظهر قوي يحسّن وقفتك ويسهّل السحب والرفع والشيل في حياتك اليومية. درّبه بتمارين السحب من الأعلى والسحب باتجاه الجسم.',
   'A strong back supports good posture and makes pulling, lifting and carrying easier in daily life. Train it with pulldown and rowing movements.',
   10),
  ('chest', 'الصدر', 'Chest',
   'في مقدمة أعلى الجذع، من عظم الترقوة وعظم القص إلى أعلى الذراع.',
   'On the front of the upper torso, running from the collarbone and breastbone to the upper arm.',
   'تدفع الذراعين للأمام وتضمّهما باتجاه منتصف الجسم.',
   'Pushes the arms forward and brings them in toward the middle of the body.',
   'عضلات الصدر تشتغل في كل حركة دفع، مثل دفع باب ثقيل أو النهوض من الأرض. تمارين الضغط والبنش أساس تدريبها، وتشتغل معها الأكتاف والترايسبس.',
   'The chest works in every pushing action, such as pushing a heavy door or getting up from the floor. Push-ups and presses are its core exercises, with the shoulders and triceps helping.',
   20),
  ('shoulders', 'الأكتاف', 'Shoulders',
   'تغطي مفصل الكتف من الأمام والجانب والخلف (العضلة الدالية)، وتحتها عضلات صغيرة تثبّت المفصل.',
   'Wrap around the shoulder joint at the front, side and rear (the deltoid), with small stabilising muscles underneath.',
   'ترفع الذراع للأمام وللجانب وللخلف، وتدفع فوق الرأس، وتثبّت مفصل الكتف.',
   'Raise the arm forward, sideways and backward, press overhead, and keep the shoulder joint stable.',
   'مفصل الكتف أكثر مفصل يتحرك في الجسم، فيحتاج قوة وتوازن بين جهاته الثلاث. اجمع بين تمارين الدفع فوق الرأس والرفع الجانبي وتمارين الكتف الخلفي.',
   'The shoulder is the most mobile joint in the body, so it needs strength that is balanced across its three sides. Combine overhead pressing, lateral raises and rear-shoulder work.',
   30),
  ('biceps', 'البايسبس (العضلة ذات الرأسين)', 'Biceps',
   'في مقدمة أعلى الذراع بين الكتف والكوع.',
   'On the front of the upper arm, between the shoulder and the elbow.',
   'تثني الكوع وتلفّ الساعد حتى تصير راحة اليد للأعلى.',
   'Bends the elbow and rotates the forearm so the palm turns upward.',
   'تستخدمها كل ما شلت شي أو سحبته باتجاهك. تتدرّب مباشرة بتمارين التبادل (Curl)، وتشتغل بعد مع تمارين سحب الظهر.',
   'You use it whenever you lift something or pull it toward you. It is trained directly with curls and also works during back pulling exercises.',
   40),
  ('triceps', 'الترايسبس (العضلة ثلاثية الرؤوس)', 'Triceps',
   'في الجهة الخلفية من أعلى الذراع بين الكتف والكوع.',
   'On the back of the upper arm, between the shoulder and the elbow.',
   'تمدّ الكوع وتفرد الذراع.',
   'Straightens the elbow and extends the arm.',
   'تشكّل الجزء الأكبر من حجم أعلى الذراع وتشتغل في كل حركات الدفع. تتدرّب بتمارين مدّ الكوع مثل الكيبل للأسفل، ومع تمارين الضغط للصدر والأكتاف.',
   'It makes up most of the upper arm''s size and works in every pushing movement. Train it with elbow-extension exercises such as pushdowns, and through chest and shoulder presses.',
   50),
  ('forearms', 'الساعد', 'Forearms',
   'بين الكوع والمعصم، ويحتوي على مجموعة عضلات صغيرة من جهة راحة اليد ومن جهة ظهرها.',
   'Between the elbow and the wrist, containing a group of small muscles on both the palm side and the back-of-hand side.',
   'تحرّك المعصم والأصابع وتعطيك قوة القبضة.',
   'Move the wrist and fingers and provide grip strength.',
   'قوة القبضة تساعدك في شيل الأغراض وفي أغلب تمارين السحب. درّبها بتمارين المعصم وتمارين المسك والشيل.',
   'Grip strength helps with carrying things and with most pulling exercises. Train it with wrist exercises, holds and carries.',
   60),
  ('hips', 'الأرداف والأفخاذ', 'Glutes, Hips & Thighs',
   'تشمل عضلات المؤخرة (الأرداف) حول الورك، وعضلات الفخذ الأمامية (الكوادز)، وعضلات الفخذ الخلفية (الهامسترنق).',
   'Includes the glutes around the hips, the quadriceps on the front of the thigh, and the hamstrings on the back of the thigh.',
   'الأرداف تمدّ الورك وتثبّت الحوض، والفخذ الأمامي يمدّ الركبة، والفخذ الخلفي يثني الركبة ويساعد في مدّ الورك.',
   'The glutes extend the hip and steady the pelvis, the quadriceps straighten the knee, and the hamstrings bend the knee and assist hip extension.',
   'هذي أكبر وأقوى عضلات الجسم، وتستخدمها في المشي وصعود الدرج والقيام من الكرسي. السكوات واللانج يركّزان على الفخذ الأمامي والأرداف، والديدلفت الروماني والهيب ثرست على الفخذ الخلفي والأرداف.',
   'These are the largest and strongest muscles in the body, used for walking, climbing stairs and standing up from a chair. Squats and lunges emphasise the quadriceps and glutes; Romanian deadlifts and hip thrusts emphasise the hamstrings and glutes.',
   70),
  ('calf', 'السمانة (بطة الرجل)', 'Calves',
   'في الجهة الخلفية من أسفل الرجل بين الركبة والكعب.',
   'On the back of the lower leg, between the knee and the heel.',
   'ترفع الكعب عن الأرض وتدفع الجسم للأمام عند المشي والركض والقفز.',
   'Lift the heel off the ground and push the body forward when walking, running and jumping.',
   'عضلات السمانة تشتغل مع كل خطوة وتتحمّل تكرارات كثيرة. درّبها بتمارين رفع الكعب والركبة مستقيمة وبعد والركبة مثنية.',
   'The calves work with every step and tolerate plenty of repetitions. Train them with heel raises done with both straight and bent knees.',
   80),
  ('abs', 'البطن', 'Abs & Core',
   'في مقدمة وجانبي الجذع بين الأضلاع والحوض، وتشمل عضلات البطن الأمامية والجانبية والعميقة.',
   'On the front and sides of the torso between the ribs and the pelvis, including the front, side and deep abdominal muscles.',
   'تثني الجذع وتلفّه، وتثبّت العمود الفقري والحوض أثناء الحركة ورفع الأوزان.',
   'Bend and rotate the torso, and stabilise the spine and pelvis during movement and lifting.',
   'عضلات بطن قوية تحمي أسفل الظهر وتنقل القوة بين الجزء العلوي والسفلي من الجسم. ابدأ بتمارين الثبات مثل البلانك، وبعدين أضف تمارين الثني. ظهور عضلات البطن يعتمد على نسبة الدهون في الجسم بعد، مو على التمارين بروحها.',
   'Strong abs protect the lower back and transfer force between the upper and lower body. Start with stability exercises such as the plank, then add curling movements. How visible the abs are also depends on body-fat level, not on exercises alone.',
   90)
on conflict (id) do update set
  name_ar = excluded.name_ar, name_en = excluded.name_en,
  location_ar = excluded.location_ar, location_en = excluded.location_en,
  function_ar = excluded.function_ar, function_en = excluded.function_en,
  summary_ar = excluded.summary_ar, summary_en = excluded.summary_en,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------------------------------
-- Exercise library (61 rows)
-- ---------------------------------------------------------------------------------------------------
insert into public.exercise_library
  (id, name_ar, name_en, primary_muscle, secondary_muscles, equipment_ar, equipment_en, difficulty, environments,
   instructions_ar, instructions_en, cues_ar, cues_en, mistakes_ar, mistakes_en, safety_ar, safety_en,
   alternatives, default_sets, default_reps, rest_seconds, sources, review_status, sort_order)
values
  -- ===== back =====
  ('lat-pulldown', 'سحب عالي (Lat Pulldown)', 'Lat Pulldown', 'back', array['biceps', 'forearms']::text[],
    'جهاز السحب العالي (كيبل)', 'Lat pulldown machine (cable)', 'beginner', array['gym']::text[],
    array[
      'اضبط مسند الفخذين حتى يثبّت رجليك، وامسك البار بقبضة أوسع قليلاً من الكتفين.',
      'اجلس وصدرك مرفوع مع ميلان بسيط للخلف، وشدّ عضلات بطنك.',
      'انزل بكتفيك للأسفل أولاً، ثم اسحب البار إلى أعلى الصدر والكوعان يتجهان للأسفل.',
      'توقف لحظة، ثم رجّع البار ببطء حتى تمتد ذراعاك.'
    ]::text[],
    array[
      'Set the thigh pad so it holds your legs in place and grip the bar a little wider than your shoulders.',
      'Sit tall with your chest lifted and a slight lean back, and tighten your midsection.',
      'Draw your shoulders down first, then pull the bar to your upper chest with your elbows travelling downward.',
      'Pause briefly, then let the bar rise slowly until your arms are straight again.'
    ]::text[],
    array[
      'فكّر أنك تسحب بكوعيك مو بكفّيك.',
      'خل صدرك مرفوع طول الحركة.',
      'تحكّم بالرجوع ولا تخل الوزن يسحبك.'
    ]::text[],
    array[
      'Think of pulling with your elbows, not your hands.',
      'Keep your chest lifted the whole time.',
      'Control the way up; do not let the weight yank you.'
    ]::text[],
    array[
      'الميلان الكثير للخلف والتأرجح لسحب الوزن.',
      'سحب البار خلف الرقبة.',
      'رفع الكتفين باتجاه الأذنين أثناء السحب.'
    ]::text[],
    array[
      'Leaning far back and swinging to move the weight.',
      'Pulling the bar behind the neck.',
      'Shrugging the shoulders toward the ears while pulling.'
    ]::text[],
    'اسحب البار أمام الوجه إلى أعلى الصدر فقط، وتوقف إذا حسّيت بألم في الكتف.',
    'Pull the bar in front of your face to the upper chest only, and stop if you feel shoulder pain.',
    array['pull-up', 'resistance-band-row', 'seated-cable-row']::text[], 3, '8-12', 90,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library: Seated Lat Pulldown", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/158/seated-lat-pulldown/"}]'::jsonb,
    'unreviewed', 10),
  ('seated-cable-row', 'سحب أرضي (Seated Row)', 'Seated Cable Row', 'back', array['biceps', 'shoulders']::text[],
    'جهاز السحب الأرضي (كيبل) مع مقبض ضيق', 'Seated cable row machine with a narrow handle', 'beginner', array['gym']::text[],
    array[
      'اجلس وثبّت قدميك على المسند مع ثني بسيط في الركبتين، وامسك المقبض.',
      'افرد ظهرك وارفع صدرك وذراعاك ممدودتان.',
      'اسحب المقبض باتجاه بطنك وكوعاك قريبان من جسمك، وضمّ لوحي الكتف.',
      'رجّع المقبض ببطء حتى تمتد ذراعاك بدون ما يتقوّس ظهرك.'
    ]::text[],
    array[
      'Sit with your feet on the footplate, knees slightly bent, and take hold of the handle.',
      'Sit upright with a long spine, chest up and arms extended.',
      'Pull the handle toward your stomach with your elbows close to your body, squeezing your shoulder blades together.',
      'Return the handle slowly until your arms are straight, without letting your back round.'
    ]::text[],
    array[
      'الجذع ثابت والحركة من الذراعين والكتفين.',
      'ضمّ لوحي الكتف في نهاية السحب.',
      'الكوعان يمرّان بجانب الخصر.'
    ]::text[],
    array[
      'Torso stays still; the arms and shoulders do the moving.',
      'Squeeze your shoulder blades at the end of each pull.',
      'Elbows brush past your sides.'
    ]::text[],
    array[
      'تقويس الظهر عند الرجوع للأمام.',
      'التأرجح بالجذع للخلف لسحب وزن أثقل.',
      'رفع الكتفين أثناء السحب.'
    ]::text[],
    array[
      'Rounding the back as the handle goes forward.',
      'Rocking the torso backward to move a heavier load.',
      'Shrugging the shoulders during the pull.'
    ]::text[],
    'حافظ على ظهرك مستقيماً طول الوقت، وخفّف الوزن إذا ما قدرت تثبّت جذعك.',
    'Keep your back straight throughout, and reduce the weight if you cannot hold your torso still.',
    array['resistance-band-row', 'one-arm-dumbbell-row']::text[], 3, '8-12', 90,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library: Seated Row", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/48/seated-row/"}]'::jsonb,
    'unreviewed', 20),
  ('one-arm-dumbbell-row', 'سحب دمبل بذراع واحدة', 'One-Arm Dumbbell Row', 'back', array['biceps', 'shoulders']::text[],
    'دمبل وبنش (أو كرسي ثابت)', 'Dumbbell and a bench (or a sturdy chair)', 'beginner', array['gym', 'home']::text[],
    array[
      'حط يدك وركبتك من نفس الجهة على البنش، والرجل الثانية ثابتة على الأرض.',
      'امسك الدمبل باليد الثانية وذراعك ممدودة للأسفل وظهرك مستوٍ.',
      'اسحب الدمبل باتجاه خصرك والكوع قريب من جسمك.',
      'نزّل الدمبل ببطء، وكمّل العدّات ثم بدّل الجهة.'
    ]::text[],
    array[
      'Place one hand and the same-side knee on the bench, with the other foot planted on the floor.',
      'Hold the dumbbell in the free hand, arm hanging straight down and back flat.',
      'Pull the dumbbell toward your hip, keeping the elbow close to your body.',
      'Lower it slowly, finish your reps, then switch sides.'
    ]::text[],
    array[
      'ظهرك مثل الطاولة: مستوٍ وثابت.',
      'اسحب الكوع للخلف وللأعلى.',
      'لا تلفّ جذعك مع السحب.'
    ]::text[],
    array[
      'Back like a table top: flat and steady.',
      'Drive the elbow back and up.',
      'Do not twist your torso as you pull.'
    ]::text[],
    array[
      'لفّ الجذع لرفع الدمبل.',
      'تقويس الظهر أو إنزال الرأس.',
      'سحب سريع بدون تحكم في النزول.'
    ]::text[],
    array[
      'Rotating the torso to heave the dumbbell up.',
      'Rounding the back or dropping the head.',
      'Jerking the weight with no control on the way down.'
    ]::text[],
    'ثبّت جسمك على سطح ما يتحرك، وخل أسفل ظهرك بوضعه الطبيعي بدون تقوّس.',
    'Support yourself on a surface that will not move, and keep your lower back in its natural position.',
    array['seated-cable-row', 'resistance-band-row']::text[], 3, '8-12', 75,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 30),
  ('bent-over-barbell-row', 'سحب بار منحني (Barbell Row)', 'Bent-Over Barbell Row', 'back', array['biceps', 'forearms', 'hips']::text[],
    'بار وأوزان', 'Barbell and plates', 'intermediate', array['gym']::text[],
    array[
      'قف والقدمان بعرض الورك، وامسك البار بقبضة أوسع قليلاً من الكتفين.',
      'اثنِ ركبتيك قليلاً وادفع وركك للخلف حتى يميل جذعك للأمام وظهرك مستقيم.',
      'اسحب البار باتجاه أسفل الصدر أو أعلى البطن.',
      'نزّل البار بتحكم حتى تمتد ذراعاك، وحافظ على نفس ميلان الجذع.'
    ]::text[],
    array[
      'Stand with feet hip-width apart and grip the bar slightly wider than your shoulders.',
      'Bend your knees slightly and push your hips back until your torso leans forward with a straight back.',
      'Pull the bar toward your lower chest or upper stomach.',
      'Lower the bar under control until your arms are straight, keeping the same torso angle.'
    ]::text[],
    array[
      'شدّ بطنك قبل كل عدّة.',
      'البار قريب من رجليك.',
      'ضمّ لوحي الكتف في الأعلى.'
    ]::text[],
    array[
      'Brace your midsection before each rep.',
      'Keep the bar close to your legs.',
      'Squeeze the shoulder blades at the top.'
    ]::text[],
    array[
      'تقويس أسفل الظهر.',
      'رفع الجذع مع كل سحبة لاستخدام الزخم.',
      'اختيار وزن ثقيل يخرّب وضع الجسم.'
    ]::text[],
    array[
      'Rounding the lower back.',
      'Standing up with every pull to use momentum.',
      'Choosing a load so heavy that posture breaks down.'
    ]::text[],
    'هذا التمرين يحمّل أسفل الظهر؛ ابدأ بوزن خفيف، وإذا ما قدرت تحافظ على استقامة ظهرك اختر تمرين سحب مسنود.',
    'This lift loads the lower back; start light, and if you cannot keep your back straight choose a supported row instead.',
    array['one-arm-dumbbell-row', 'seated-cable-row']::text[], 3, '6-10', 120,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 40),
  ('pull-up', 'عقلة (Pull-up)', 'Pull-Up', 'back', array['biceps', 'forearms']::text[],
    'بار عقلة', 'Pull-up bar', 'advanced', array['gym', 'home']::text[],
    array[
      'امسك البار بقبضة أوسع قليلاً من الكتفين وراحة اليد للأمام، وتعلّق وذراعاك ممدودتان.',
      'شدّ بطنك وانزل بكتفيك بعيداً عن أذنيك.',
      'اسحب جسمك للأعلى حتى يتجاوز ذقنك البار.',
      'انزل ببطء حتى تمتد ذراعاك بالكامل.'
    ]::text[],
    array[
      'Grip the bar slightly wider than your shoulders, palms facing away, and hang with straight arms.',
      'Brace your midsection and draw your shoulders down away from your ears.',
      'Pull yourself up until your chin clears the bar.',
      'Lower slowly until your arms are fully straight.'
    ]::text[],
    array[
      'اسحب كوعيك باتجاه خصرك.',
      'الجسم مشدود بدون تأرجح.',
      'النزول أبطأ من الصعود.'
    ]::text[],
    array[
      'Drive your elbows toward your hips.',
      'Body tight, no swinging.',
      'Lower more slowly than you rise.'
    ]::text[],
    array[
      'التأرجح أو ركل الرجلين للصعود.',
      'عدّات ناقصة بدون مدّ الذراعين.',
      'مدّ الرقبة للأعلى للوصول للبار.'
    ]::text[],
    array[
      'Swinging or kicking the legs to get up.',
      'Half reps without straightening the arms.',
      'Craning the neck to reach the bar.'
    ]::text[],
    'تأكد إن البار مثبّت زين. إذا ما قدرت تسوي عدّة كاملة، استخدم رباط مساعد أو جهاز العقلة المساعد، وانزل بتحكم بدل ما تطيح.',
    'Make sure the bar is securely fixed. If you cannot do a full rep yet, use an assistance band or assisted machine, and step down under control rather than dropping.',
    array['lat-pulldown', 'resistance-band-row']::text[], 3, '4-8', 120,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 50),
  ('resistance-band-row', 'سحب بالحبل المطاطي', 'Resistance Band Row', 'back', array['biceps', 'shoulders']::text[],
    'حبل مطاطي (رباط مقاومة)', 'Resistance band', 'beginner', array['home']::text[],
    array[
      'اجلس على الأرض ورجلاك ممدودتان مع ثني بسيط، ولفّ الحبل حول باطن القدمين.',
      'امسك طرفي الحبل وافرد ظهرك وارفع صدرك.',
      'اسحب يديك باتجاه خصرك وضمّ لوحي الكتف.',
      'رجّع يديك ببطء حتى تمتد ذراعاك.'
    ]::text[],
    array[
      'Sit on the floor with legs out and slightly bent, and loop the band around the soles of your feet.',
      'Hold both ends, sit tall and lift your chest.',
      'Pull your hands toward your waist and squeeze your shoulder blades together.',
      'Return slowly until your arms are straight.'
    ]::text[],
    array[
      'الكوعان قريبان من الجسم.',
      'توقف ثانية في نهاية السحب.',
      'ظهرك مفرود طول الحركة.'
    ]::text[],
    array[
      'Elbows stay close to your body.',
      'Hold for a second at the end of the pull.',
      'Stay tall through the whole movement.'
    ]::text[],
    array[
      'الميلان للخلف بدل السحب بالذراعين.',
      'ترك الحبل يرجع بسرعة.',
      'تقويس الظهر.'
    ]::text[],
    array[
      'Leaning back instead of pulling with the arms.',
      'Letting the band snap back quickly.',
      'Rounding the back.'
    ]::text[],
    'افحص الحبل قبل الاستخدام وتأكد إنه ما فيه شقوق، وثبّته زين حول قدميك حتى ما يفلت.',
    'Check the band for cracks before use and make sure it is secure around your feet so it cannot slip.',
    array['seated-cable-row', 'one-arm-dumbbell-row']::text[], 3, '12-15', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 60),
  ('superman-hold', 'تمرين سوبرمان (رفع الظهر على الأرض)', 'Superman (Floor Back Extension)', 'back', array['hips']::text[],
    'فرشة تمارين', 'Exercise mat', 'beginner', array['home']::text[],
    array[
      'انسدح على بطنك وذراعاك ممدودتان أمامك ورجلاك مستقيمتان.',
      'ارفع صدرك وذراعيك ورجليك عن الأرض شوي بنفس الوقت.',
      'ثبّت ثانية أو ثانيتين وعينك على الأرض.',
      'انزل ببطء وكرّر.'
    ]::text[],
    array[
      'Lie face down with your arms stretched out in front and legs straight.',
      'Lift your chest, arms and legs a little off the floor together.',
      'Hold for one or two seconds, eyes on the floor.',
      'Lower slowly and repeat.'
    ]::text[],
    array[
      'ارتفاع بسيط يكفي.',
      'شدّ عضلات المؤخرة مع الرفع.',
      'الرقبة على امتداد الظهر.'
    ]::text[],
    array[
      'A small lift is enough.',
      'Squeeze your glutes as you lift.',
      'Neck stays in line with your back.'
    ]::text[],
    array[
      'رفع الرأس والنظر للأمام.',
      'الرفع العالي بقوة مع تقويس أسفل الظهر.',
      'حبس النفس.'
    ]::text[],
    array[
      'Lifting the head to look forward.',
      'Lifting high and hard, over-arching the lower back.',
      'Holding your breath.'
    ]::text[],
    'ارفع لمدى مريح فقط. إذا عندك ألم في أسفل الظهر، وقّف التمرين واستشر مختص.',
    'Lift only through a comfortable range. If you have lower-back pain, stop and check with a professional.',
    array['bird-dog', 'resistance-band-row']::text[], 3, '10-12', 45,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 70),
  -- ===== chest =====
  ('barbell-bench-press', 'بنش برس بالبار (Bench Press)', 'Barbell Bench Press', 'chest', array['triceps', 'shoulders']::text[],
    'بار وبنش مستوٍ مع حامل', 'Barbell, flat bench and rack', 'intermediate', array['gym']::text[],
    array[
      'انسدح على البنش وعيناك تحت البار، وقدماك ثابتتان على الأرض.',
      'امسك البار بقبضة أوسع قليلاً من الكتفين، وضمّ لوحي الكتف للخلف وللأسفل.',
      'ارفع البار من الحامل وثبّته فوق صدرك وذراعاك ممدودتان.',
      'نزّل البار بتحكم إلى منتصف الصدر والكوعان بزاوية مائلة عن الجسم.',
      'ادفع البار للأعلى حتى تمتد ذراعاك.'
    ]::text[],
    array[
      'Lie on the bench with your eyes under the bar and feet flat on the floor.',
      'Grip the bar slightly wider than your shoulders and pull your shoulder blades back and down.',
      'Lift the bar out of the rack and hold it over your chest with straight arms.',
      'Lower the bar under control to mid-chest with your elbows angled partly away from your body.',
      'Press the bar back up until your arms are straight.'
    ]::text[],
    array[
      'قدماك تدفعان الأرض ومؤخرتك على البنش.',
      'المعصم مستقيم فوق الكوع.',
      'لوحا الكتف مضمومان طول التمرين.'
    ]::text[],
    array[
      'Feet press into the floor; hips stay on the bench.',
      'Wrists straight and stacked over the elbows.',
      'Shoulder blades stay pinched throughout.'
    ]::text[],
    array[
      'ارتداد البار من الصدر.',
      'رفع المؤخرة عن البنش.',
      'فتح الكوعين بزاوية 90 درجة عن الجسم.',
      'قبضة بدون لفّ الإبهام حول البار.'
    ]::text[],
    array[
      'Bouncing the bar off the chest.',
      'Lifting the hips off the bench.',
      'Flaring the elbows straight out to the sides.',
      'Gripping without wrapping the thumbs around the bar.'
    ]::text[],
    'استعن بمساعد (سبوتر) أو استخدم قضبان الأمان مع الأوزان الثقيلة، ولفّ إبهامك حول البار دايماً.',
    'Use a spotter or safety bars for heavy sets, and always wrap your thumbs around the bar.',
    array['dumbbell-bench-press', 'machine-chest-press', 'push-up']::text[], 3, '6-10', 120,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 80),
  ('dumbbell-bench-press', 'بنش برس بالدمبل', 'Dumbbell Bench Press', 'chest', array['triceps', 'shoulders']::text[],
    'دمبلين وبنش مستوٍ', 'Two dumbbells and a flat bench', 'beginner', array['gym', 'home']::text[],
    array[
      'اجلس على طرف البنش والدمبلين على فخذيك، ثم انسدح وارفعهما فوق صدرك.',
      'ثبّت قدميك على الأرض وضمّ لوحي الكتف.',
      'نزّل الدمبلين ببطء إلى جانبي الصدر.',
      'ادفعهما للأعلى حتى تمتد ذراعاك بدون ما تضربهما ببعض.'
    ]::text[],
    array[
      'Sit on the end of the bench with the dumbbells on your thighs, then lie back and bring them above your chest.',
      'Plant your feet and pull your shoulder blades together.',
      'Lower the dumbbells slowly to the sides of your chest.',
      'Press them up until your arms are straight, without clanging them together.'
    ]::text[],
    array[
      'المعصم مستقيم والدمبل فوق الكوع.',
      'الكوعان مائلان قليلاً باتجاه الجسم.',
      'نزول بطيء وصعود قوي.'
    ]::text[],
    array[
      'Wrists straight, dumbbell over the elbow.',
      'Elbows angled slightly in toward your body.',
      'Slow down, strong up.'
    ]::text[],
    array[
      'النزول العميق اللي يشدّ الكتف بشكل غير مريح.',
      'تقويس أسفل الظهر بشكل مبالغ.',
      'اختلاف مسار اليدين.'
    ]::text[],
    array[
      'Dropping so deep that the shoulders feel strained.',
      'Over-arching the lower back.',
      'Letting the two arms follow different paths.'
    ]::text[],
    'بعد آخر عدّة رجّع الدمبلين إلى فخذيك واجلس، ولا ترميهما من وضع الاستلقاء.',
    'After the last rep bring the dumbbells back to your thighs and sit up; do not drop them from the lying position.',
    array['push-up', 'machine-chest-press', 'barbell-bench-press']::text[], 3, '8-12', 90,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 90),
  ('incline-dumbbell-press', 'بنش مائل بالدمبل (Incline Press)', 'Incline Dumbbell Press', 'chest', array['shoulders', 'triceps']::text[],
    'دمبلين وبنش مائل (30-45 درجة)', 'Two dumbbells and an incline bench (30-45 degrees)', 'intermediate', array['gym']::text[],
    array[
      'اضبط البنش على ميلان 30 إلى 45 درجة واجلس وظهرك ملاصق له.',
      'ارفع الدمبلين إلى مستوى الكتفين وراحة اليد للأمام.',
      'ادفع الدمبلين للأعلى حتى تمتد ذراعاك فوق أعلى الصدر.',
      'نزّلهما ببطء إلى جانبي أعلى الصدر.'
    ]::text[],
    array[
      'Set the bench to 30-45 degrees and sit with your back against it.',
      'Bring the dumbbells to shoulder level, palms facing forward.',
      'Press the dumbbells up until your arms are straight above your upper chest.',
      'Lower them slowly to the sides of your upper chest.'
    ]::text[],
    array[
      'صدرك مرفوع ولوحا الكتف للخلف.',
      'قدماك ثابتتان على الأرض.',
      'لا تقفل الكوعين بعنف في الأعلى.'
    ]::text[],
    array[
      'Chest up, shoulder blades back.',
      'Feet stay planted.',
      'Do not snap your elbows locked at the top.'
    ]::text[],
    array[
      'ميلان عالي يحوّل التمرين للأكتاف.',
      'رفع أسفل الظهر عن البنش.',
      'إنزال الدمبلين بسرعة.'
    ]::text[],
    array[
      'Setting the bench so steep it becomes a shoulder press.',
      'Lifting the lower back off the bench.',
      'Letting the dumbbells drop quickly.'
    ]::text[],
    'اختر وزن تقدر ترفعه لوضع البداية بأمان، واطلب مساعدة عند الأوزان الثقيلة.',
    'Pick a weight you can get into the start position safely, and ask for help with heavy dumbbells.',
    array['dumbbell-bench-press', 'push-up']::text[], 3, '8-12', 90,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 100),
  ('machine-chest-press', 'جهاز ضغط الصدر (Chest Press)', 'Machine Chest Press', 'chest', array['triceps', 'shoulders']::text[],
    'جهاز ضغط الصدر', 'Chest press machine', 'beginner', array['gym']::text[],
    array[
      'اضبط ارتفاع الكرسي حتى تصير المقابض بمستوى منتصف الصدر.',
      'اجلس وظهرك ورأسك على المسند وقدماك على الأرض.',
      'ادفع المقابض للأمام حتى تمتد ذراعاك تقريباً.',
      'ارجع ببطء بدون ما تلمس الأوزان بعضها.'
    ]::text[],
    array[
      'Adjust the seat so the handles line up with the middle of your chest.',
      'Sit with your back and head against the pad and feet on the floor.',
      'Push the handles forward until your arms are almost straight.',
      'Return slowly without letting the weight stack touch down.'
    ]::text[],
    array[
      'كتفاك للخلف وللأسفل.',
      'ازفر مع الدفع.',
      'حركة ناعمة بدون ارتداد.'
    ]::text[],
    array[
      'Shoulders back and down.',
      'Breathe out as you push.',
      'Smooth motion, no bouncing.'
    ]::text[],
    array[
      'كرسي منخفض أو مرتفع يخلي المقابض بمستوى غلط.',
      'إبعاد الظهر عن المسند مع الدفع.',
      'قفل الكوعين بقوة.'
    ]::text[],
    array[
      'A seat height that puts the handles too high or too low.',
      'Pulling your back off the pad as you push.',
      'Slamming the elbows locked.'
    ]::text[],
    'اضبط الجهاز على مقاسك قبل ما تبدأ، وابدأ بوزن خفيف حتى تتعود على مسار الحركة.',
    'Adjust the machine to your size before you start, and begin with a light load to learn the path.',
    array['knee-push-up', 'dumbbell-bench-press']::text[], 3, '10-12', 75,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 110),
  ('push-up', 'تمرين الضغط (Push-up)', 'Push-Up', 'chest', array['triceps', 'shoulders', 'abs']::text[],
    'وزن الجسم', 'Bodyweight', 'intermediate', array['home', 'gym']::text[],
    array[
      'حط كفّيك على الأرض بعرض الكتفين أو أوسع شوي، ومدّ رجليك للخلف على أطراف الأصابع.',
      'شدّ بطنك ومؤخرتك حتى يصير جسمك خط مستقيم من الرأس للكعب.',
      'انزل بثني الكوعين حتى يقترب صدرك من الأرض.',
      'ادفع الأرض وارجع لوضع البداية وجسمك مستقيم.'
    ]::text[],
    array[
      'Place your hands on the floor shoulder-width apart or slightly wider and extend your legs back onto your toes.',
      'Tighten your midsection and glutes so your body forms a straight line from head to heels.',
      'Bend your elbows and lower until your chest is close to the floor.',
      'Push the floor away and return to the start, keeping the straight line.'
    ]::text[],
    array[
      'الكتفان فوق الكفّين في البداية.',
      'الرأس على امتداد الظهر.',
      'الجسم يتحرك قطعة واحدة.'
    ]::text[],
    array[
      'Shoulders over hands at the start.',
      'Head in line with your spine.',
      'Move your body as one piece.'
    ]::text[],
    array[
      'هبوط الخصر باتجاه الأرض.',
      'رفع المؤخرة للأعلى.',
      'عدّات قصيرة بدون نزول كافي.'
    ]::text[],
    array[
      'Letting the hips sag toward the floor.',
      'Piking the hips up.',
      'Short reps without lowering far enough.'
    ]::text[],
    'إذا حسّيت بضغط على المعصم أو الكتف، جرّب الضغط على الركبتين أو على سطح مرتفع، ووقّف إذا في ألم.',
    'If your wrists or shoulders feel strained, switch to knee push-ups or hands on a raised surface, and stop if there is pain.',
    array['knee-push-up', 'dumbbell-bench-press', 'machine-chest-press']::text[], 3, '8-15', 75,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library: Push-up", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/41/push-up/"}]'::jsonb,
    'unreviewed', 120),
  ('knee-push-up', 'ضغط على الركبتين', 'Knee Push-Up', 'chest', array['triceps', 'shoulders']::text[],
    'وزن الجسم وفرشة', 'Bodyweight and a mat', 'beginner', array['home', 'gym']::text[],
    array[
      'انزل على ركبتيك وحط كفّيك على الأرض بعرض الكتفين أو أوسع شوي.',
      'قدّم جسمك حتى يصير خط مستقيم من الرأس للركبتين.',
      'انزل بصدرك باتجاه الأرض بتحكم.',
      'ادفع للأعلى حتى تمتد ذراعاك.'
    ]::text[],
    array[
      'Kneel and place your hands on the floor shoulder-width apart or slightly wider.',
      'Walk your hands forward until your body is straight from head to knees.',
      'Lower your chest toward the floor under control.',
      'Press up until your arms are straight.'
    ]::text[],
    array[
      'شدّ بطنك.',
      'الخصر ينزل ويصعد مع الصدر.',
      'نزول في ثانيتين.'
    ]::text[],
    array[
      'Keep your midsection tight.',
      'Hips rise and fall with the chest.',
      'Take two seconds to lower.'
    ]::text[],
    array[
      'ترك المؤخرة مرفوعة والنزول بالصدر فقط.',
      'إنزال الرأس للأمام.',
      'هبوط أسفل الظهر.'
    ]::text[],
    array[
      'Leaving the hips high and lowering only the chest.',
      'Dropping the head forward.',
      'Letting the lower back sag.'
    ]::text[],
    'استخدم فرشة تحت الركبتين، ووقّف إذا حسّيت بألم في الكتف أو المعصم.',
    'Use a mat under your knees, and stop if you feel pain in the shoulder or wrist.',
    array['push-up', 'machine-chest-press']::text[], 3, '8-12', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 130),
  ('cable-chest-fly', 'تفتيح كيبل للصدر (Cable Fly)', 'Cable Chest Fly', 'chest', array['shoulders']::text[],
    'جهاز الكيبل المزدوج (كروس أوفر)', 'Dual cable machine (crossover)', 'intermediate', array['gym']::text[],
    array[
      'اضبط البكرتين بمستوى الكتف تقريباً، وامسك مقبض بكل يد.',
      'تقدّم خطوة، وحدة من رجليك للأمام، مع ثني بسيط في الكوعين.',
      'ضمّ يديك أمام صدرك بحركة قوس واسع.',
      'ارجع ببطء حتى تحسّ بتمدد مريح في الصدر.'
    ]::text[],
    array[
      'Set both pulleys at about shoulder height and take a handle in each hand.',
      'Step forward into a staggered stance with a slight bend in your elbows.',
      'Bring your hands together in front of your chest in a wide arc.',
      'Return slowly until you feel a comfortable stretch across the chest.'
    ]::text[],
    array[
      'زاوية الكوع ثابتة طول الحركة.',
      'تخيّل أنك تحضن شجرة كبيرة.',
      'صدرك مرفوع وكتفاك للأسفل.'
    ]::text[],
    array[
      'Elbow angle stays the same throughout.',
      'Imagine hugging a big tree.',
      'Chest up, shoulders down.'
    ]::text[],
    array[
      'تحويل الحركة إلى ضغط بثني الكوعين.',
      'إرجاع اليدين للخلف أكثر من المدى المريح.',
      'وزن ثقيل يسحبك للخلف.'
    ]::text[],
    array[
      'Turning it into a press by bending the elbows.',
      'Letting the hands travel back beyond a comfortable range.',
      'A load so heavy it pulls you backward.'
    ]::text[],
    'لا تمدّ الكتف للخلف بقوة؛ وقّف عند تمدد مريح، واستخدم وزن خفيف إلى متوسط.',
    'Do not force the shoulders back; stop at a comfortable stretch and use a light to moderate load.',
    array['dumbbell-bench-press', 'push-up']::text[], 3, '10-15', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 140),
  -- ===== shoulders =====
  ('dumbbell-overhead-press', 'ضغط أكتاف بالدمبل جالس (Shoulder Press)', 'Seated Dumbbell Overhead Press', 'shoulders', array['triceps']::text[],
    'دمبلين وبنش بمسند ظهر (أو كرسي ثابت)', 'Two dumbbells and a bench with back support (or a sturdy chair)', 'intermediate', array['gym', 'home']::text[],
    array[
      'اجلس وظهرك على المسند وقدماك على الأرض، وارفع الدمبلين إلى مستوى الكتفين وراحة اليد للأمام.',
      'شدّ بطنك وخل معصميك مستقيمين.',
      'ادفع الدمبلين للأعلى حتى تمتد ذراعاك فوق رأسك.',
      'نزّلهما ببطء إلى مستوى الكتفين.'
    ]::text[],
    array[
      'Sit with your back against the pad and feet on the floor, and bring the dumbbells to shoulder level with palms forward.',
      'Brace your midsection and keep your wrists straight.',
      'Press the dumbbells up until your arms are straight overhead.',
      'Lower them slowly back to shoulder level.'
    ]::text[],
    array[
      'الكوعان قدّام الجسم شوي مو مفتوحين للجنب بالكامل.',
      'أسفل ظهرك قريب من المسند.',
      'كتفاك بعيدان عن أذنيك.'
    ]::text[],
    array[
      'Elbows slightly in front of your body, not flared fully out to the sides.',
      'Lower back stays close to the pad.',
      'Shoulders away from your ears.'
    ]::text[],
    array[
      'تقويس أسفل الظهر مع الدفع.',
      'ثني المعصمين للخلف.',
      'إنزال الدمبلين بسرعة.'
    ]::text[],
    array[
      'Arching the lower back as you press.',
      'Letting the wrists bend backward.',
      'Dropping the dumbbells quickly.'
    ]::text[],
    'ابدأ بوزن تتحكم فيه، ولا تدفع فوق رأسك إذا عندك ألم في الكتف؛ اطلب مساعد مع الأوزان الثقيلة.',
    'Start with a weight you can control, do not press overhead through shoulder pain, and use a spotter for heavy sets.',
    array['pike-push-up', 'barbell-overhead-press', 'dumbbell-lateral-raise']::text[], 3, '8-12', 90,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library: Seated Overhead Press", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/45/seated-overhead-press/"}]'::jsonb,
    'unreviewed', 150),
  ('barbell-overhead-press', 'ضغط أكتاف بالبار واقف (Overhead Press)', 'Standing Barbell Overhead Press', 'shoulders', array['triceps', 'abs']::text[],
    'بار وحامل', 'Barbell and rack', 'advanced', array['gym']::text[],
    array[
      'خذ البار من الحامل على أعلى الصدر بقبضة أوسع قليلاً من الكتفين.',
      'قف والقدمان بعرض الورك، وشدّ بطنك ومؤخرتك.',
      'ادفع البار للأعلى بخط مستقيم، وأبعد ذقنك للخلف حتى يمرّ البار.',
      'أكمل حتى تمتد ذراعاك والبار فوق منتصف القدم.',
      'نزّل البار بتحكم إلى أعلى الصدر.'
    ]::text[],
    array[
      'Take the bar from the rack onto your upper chest with a grip just outside shoulder width.',
      'Stand with feet hip-width apart and tighten your midsection and glutes.',
      'Press the bar straight up, tucking your chin back to let it pass.',
      'Finish with arms straight and the bar over the middle of your feet.',
      'Lower the bar under control to your upper chest.'
    ]::text[],
    array[
      'الساعدان عموديان تحت البار.',
      'الأضلاع للأسفل وبدون ميلان للخلف.',
      'ادخل برأسك تحت البار في الأعلى.'
    ]::text[],
    array[
      'Forearms vertical under the bar.',
      'Ribs down, no leaning back.',
      'Bring your head through under the bar at the top.'
    ]::text[],
    array[
      'الميلان للخلف وتقويس أسفل الظهر.',
      'استخدام الرجلين لدفع البار.',
      'دفع البار للأمام بدل الأعلى.'
    ]::text[],
    array[
      'Leaning back and arching the lower back.',
      'Using the legs to bounce the bar up.',
      'Pressing the bar forward instead of up.'
    ]::text[],
    'هذا تمرين متقدم؛ تعلّم الحركة ببار خفيف أولاً، ووقّف إذا ما قدرت تمنع تقوّس ظهرك.',
    'This is an advanced lift; learn it with a light bar first, and stop the set if you cannot keep your back from arching.',
    array['dumbbell-overhead-press', 'pike-push-up']::text[], 3, '5-8', 120,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 160),
  ('dumbbell-lateral-raise', 'رفرفة جانبي بالدمبل (Lateral Raise)', 'Dumbbell Lateral Raise', 'shoulders', '{}'::text[],
    'دمبلين خفيفين (أو قناني ماي في البيت)', 'Two light dumbbells (or water bottles at home)', 'beginner', array['gym', 'home']::text[],
    array[
      'قف والدمبلين بجانب جسمك وراحة اليد للداخل مع ثني بسيط في الكوعين.',
      'شدّ بطنك وانزل بكتفيك للأسفل.',
      'ارفع ذراعيك للجانبين حتى يصيران بمستوى الكتف تقريباً.',
      'نزّل ببطء إلى وضع البداية.'
    ]::text[],
    array[
      'Stand with the dumbbells at your sides, palms in and elbows slightly bent.',
      'Brace your midsection and set your shoulders down.',
      'Raise your arms out to the sides until they are about level with your shoulders.',
      'Lower slowly to the start.'
    ]::text[],
    array[
      'ارفع بكوعيك مو بكفّيك.',
      'لا تتجاوز مستوى الكتف.',
      'النزول في 2-3 ثواني.'
    ]::text[],
    array[
      'Lead with your elbows, not your hands.',
      'No higher than shoulder level.',
      'Take 2-3 seconds to lower.'
    ]::text[],
    array[
      'التأرجح بالجسم لرفع وزن ثقيل.',
      'رفع الكتفين باتجاه الأذنين.',
      'ثني المعصم للأعلى أو للأسفل.'
    ]::text[],
    array[
      'Swinging the body to lift a heavy weight.',
      'Shrugging the shoulders toward the ears.',
      'Bending the wrists up or down.'
    ]::text[],
    'استخدم وزن خفيف وحركة متحكم فيها، ووقّف عند مستوى الكتف؛ إذا حسّيت بقرصة في الكتف قلّل المدى.',
    'Use a light weight and controlled motion and stop at shoulder height; if you feel a pinch in the shoulder, shorten the range.',
    array['band-pull-apart', 'dumbbell-overhead-press']::text[], 3, '12-15', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library: Lateral Raise", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/26/lateral-raise/"}]'::jsonb,
    'unreviewed', 170),
  ('face-pull', 'فيس بول بالكيبل (Face Pull)', 'Cable Face Pull', 'shoulders', array['back']::text[],
    'كيبل مع حبل', 'Cable machine with rope attachment', 'intermediate', array['gym']::text[],
    array[
      'اضبط البكرة بمستوى الوجه أو أعلى شوي وامسك طرفي الحبل.',
      'ارجع خطوة حتى تمتد ذراعاك، وقف بثبات.',
      'اسحب الحبل باتجاه وجهك وافتح يديك للجانبين والكوعان مرفوعان.',
      'ضمّ لوحي الكتف لحظة، ثم ارجع ببطء.'
    ]::text[],
    array[
      'Set the pulley at face height or slightly higher and hold both ends of the rope.',
      'Step back until your arms are straight and stand firm.',
      'Pull the rope toward your face, spreading your hands apart with elbows high.',
      'Squeeze your shoulder blades for a moment, then return slowly.'
    ]::text[],
    array[
      'الكوعان بمستوى الكتفين أو أعلى شوي.',
      'اليدان تنتهيان بجانب الأذنين.',
      'الجذع ثابت.'
    ]::text[],
    array[
      'Elbows level with or slightly above the shoulders.',
      'Hands finish beside your ears.',
      'Torso stays still.'
    ]::text[],
    array[
      'الميلان للخلف لسحب وزن ثقيل.',
      'إنزال الكوعين وتحويله لتمرين سحب عادي.',
      'دفع الرأس للأمام.'
    ]::text[],
    array[
      'Leaning back to pull a heavy load.',
      'Dropping the elbows and turning it into a regular row.',
      'Poking the head forward.'
    ]::text[],
    'اختر وزن خفيف يخليك تتحكم بالحركة بالكامل؛ الهدف هو عضلات الكتف الخلفية مو رفع وزن ثقيل.',
    'Choose a light load you can fully control; the goal is the rear shoulder muscles, not lifting heavy.',
    array['band-pull-apart', 'bent-over-reverse-fly']::text[], 3, '12-15', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 180),
  ('bent-over-reverse-fly', 'رفرفة خلفي بالدمبل (Reverse Fly)', 'Bent-Over Dumbbell Reverse Fly', 'shoulders', array['back']::text[],
    'دمبلين خفيفين', 'Two light dumbbells', 'beginner', array['gym', 'home']::text[],
    array[
      'امسك الدمبلين، واثنِ ركبتيك قليلاً وادفع وركك للخلف حتى يميل جذعك للأمام.',
      'خل ذراعيك متدليتين تحت صدرك مع ثني بسيط في الكوعين.',
      'افتح ذراعيك للجانبين حتى يصيران بمستوى الظهر.',
      'نزّل ببطء وكرّر.'
    ]::text[],
    array[
      'Hold the dumbbells, bend your knees slightly and push your hips back so your torso leans forward.',
      'Let your arms hang under your chest with a slight elbow bend.',
      'Open your arms out to the sides until they are level with your back.',
      'Lower slowly and repeat.'
    ]::text[],
    array[
      'ظهرك مستقيم ورقبتك على امتداده.',
      'ضمّ لوحي الكتف في الأعلى.',
      'وزن خفيف وحركة نظيفة.'
    ]::text[],
    array[
      'Back straight, neck in line with it.',
      'Squeeze your shoulder blades at the top.',
      'Light weight, clean movement.'
    ]::text[],
    array[
      'رفع الجذع مع كل عدّة.',
      'تقويس الظهر.',
      'ثني الكوعين كثير وسحب الدمبلين مثل تمرين الظهر.'
    ]::text[],
    array[
      'Lifting the torso with each rep.',
      'Rounding the back.',
      'Bending the elbows a lot and rowing the weights.'
    ]::text[],
    'إذا تعب أسفل ظهرك، سوّ التمرين وصدرك مسنود على بنش مائل أو وأنت جالس ومنحني للأمام.',
    'If your lower back tires, do the exercise with your chest supported on an incline bench or seated and leaning forward.',
    array['band-pull-apart', 'face-pull']::text[], 3, '12-15', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 190),
  ('pike-push-up', 'ضغط بايك للأكتاف (Pike Push-up)', 'Pike Push-Up', 'shoulders', array['triceps', 'chest']::text[],
    'وزن الجسم', 'Bodyweight', 'intermediate', array['home']::text[],
    array[
      'ابدأ من وضع الضغط، ثم قرّب قدميك من يديك وارفع وركك للأعلى حتى يصير جسمك مثل حرف V مقلوب.',
      'اثنِ كوعيك وانزل برأسك باتجاه الأرض قدّام يديك شوي.',
      'توقف قبل ما يلمس رأسك الأرض.',
      'ادفع الأرض حتى تمتد ذراعاك.'
    ]::text[],
    array[
      'Start in a push-up position, then walk your feet toward your hands and lift your hips so your body forms an upside-down V.',
      'Bend your elbows and lower your head toward the floor slightly in front of your hands.',
      'Stop just before your head touches the floor.',
      'Push the floor away until your arms are straight.'
    ]::text[],
    array[
      'الورك مرفوع طول الحركة.',
      'الكوعان مائلان للخلف مو مفتوحين للجنب.',
      'نزول بطيء.'
    ]::text[],
    array[
      'Hips stay high throughout.',
      'Elbows angle back rather than straight out.',
      'Lower slowly.'
    ]::text[],
    array[
      'إنزال الورك وتحويله لضغط عادي.',
      'النزول بسرعة على الرأس.',
      'وضع اليدين ضيق جداً.'
    ]::text[],
    array[
      'Dropping the hips and turning it into a regular push-up.',
      'Dropping quickly onto the head.',
      'Placing the hands too close together.'
    ]::text[],
    'سوّ التمرين على أرض ما تزلق وانزل بتحكم. تجنّبه إذا تحسّ بدوخة والرأس للأسفل أو عندك ألم في الكتف.',
    'Use a non-slip floor and lower under control. Avoid it if being head-down makes you dizzy or if you have shoulder pain.',
    array['dumbbell-overhead-press', 'push-up']::text[], 3, '6-10', 90,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 200),
  ('band-pull-apart', 'تفتيح الحبل المطاطي (Band Pull-Apart)', 'Band Pull-Apart', 'shoulders', array['back']::text[],
    'حبل مطاطي خفيف', 'Light resistance band', 'beginner', array['home']::text[],
    array[
      'قف وامسك الحبل بيديك بعرض الكتفين وذراعاك ممدودتان قدّامك بمستوى الصدر.',
      'افتح ذراعيك للجانبين حتى يلمس الحبل صدرك.',
      'ضمّ لوحي الكتف لحظة.',
      'ارجع ببطء لوضع البداية.'
    ]::text[],
    array[
      'Stand holding the band with hands shoulder-width apart and arms straight out at chest height.',
      'Pull your hands apart until the band touches your chest.',
      'Squeeze your shoulder blades briefly.',
      'Return slowly to the start.'
    ]::text[],
    array[
      'الذراعان شبه مستقيمتين.',
      'كتفاك للأسفل.',
      'الأضلاع للأسفل بدون تقويس الظهر.'
    ]::text[],
    array[
      'Arms stay nearly straight.',
      'Shoulders stay down.',
      'Ribs down, no arching.'
    ]::text[],
    array[
      'رفع الكتفين.',
      'ترك الحبل يرجع بسرعة.',
      'تقويس أسفل الظهر.'
    ]::text[],
    array[
      'Shrugging.',
      'Letting the band snap back.',
      'Arching the lower back.'
    ]::text[],
    'افحص الحبل قبل الاستخدام، وأبعده عن وجهك إذا كان قديم أو فيه شقوق.',
    'Inspect the band before use and keep it away from your face if it is old or cracked.',
    array['bent-over-reverse-fly', 'face-pull']::text[], 3, '15-20', 45,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 210),
  -- ===== biceps =====
  ('dumbbell-biceps-curl', 'تبادل دمبل (Dumbbell Curl)', 'Dumbbell Biceps Curl', 'biceps', array['forearms']::text[],
    'دمبلين', 'Two dumbbells', 'beginner', array['gym', 'home']::text[],
    array[
      'قف أو اجلس والدمبلين بجانب جسمك وراحة اليد للأمام.',
      'ثبّت كوعيك بجانب خصرك.',
      'اثنِ كوعيك وارفع الدمبلين باتجاه الكتفين.',
      'نزّل ببطء حتى تمتد ذراعاك.'
    ]::text[],
    array[
      'Stand or sit with the dumbbells at your sides, palms facing forward.',
      'Pin your elbows by your sides.',
      'Bend your elbows and curl the dumbbells toward your shoulders.',
      'Lower slowly until your arms are straight.'
    ]::text[],
    array[
      'الكوع ما يتحرك للأمام.',
      'المعصم مستقيم.',
      'النزول أبطأ من الرفع.'
    ]::text[],
    array[
      'Elbows do not drift forward.',
      'Wrists stay straight.',
      'Lower more slowly than you lift.'
    ]::text[],
    array[
      'التأرجح بالظهر لرفع الوزن.',
      'عدّات ناقصة بدون مدّ الذراع.',
      'رفع الكتفين.'
    ]::text[],
    array[
      'Swinging the back to lift the weight.',
      'Partial reps without straightening the arm.',
      'Shrugging the shoulders.'
    ]::text[],
    'اختر وزن ترفعه بدون ما يتحرك ظهرك، ووقّف إذا حسّيت بألم في الكوع أو المعصم.',
    'Pick a weight you can lift without your back moving, and stop if you feel pain in the elbow or wrist.',
    array['band-biceps-curl', 'barbell-curl', 'hammer-curl']::text[], 3, '10-12', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library: Seated Biceps Curl", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/44/seated-biceps-curl/"}]'::jsonb,
    'unreviewed', 220),
  ('barbell-curl', 'تبادل بار (Barbell Curl)', 'Barbell Curl', 'biceps', array['forearms']::text[],
    'بار مستقيم أو بار متعرّج (EZ)', 'Straight bar or EZ-bar', 'beginner', array['gym']::text[],
    array[
      'قف وامسك البار بقبضة بعرض الكتفين وراحة اليد للأعلى.',
      'شدّ بطنك وثبّت كوعيك بجانب جسمك.',
      'ارفع البار بثني الكوعين حتى يقترب من الكتفين.',
      'نزّل البار بتحكم حتى تمتد ذراعاك.'
    ]::text[],
    array[
      'Stand holding the bar with a shoulder-width, palms-up grip.',
      'Brace your midsection and keep your elbows by your sides.',
      'Curl the bar up until it nears your shoulders.',
      'Lower it under control until your arms are straight.'
    ]::text[],
    array[
      'الجسم ثابت والحركة من الكوع فقط.',
      'صدرك مرفوع.',
      'اعصر العضلة في الأعلى.'
    ]::text[],
    array[
      'Body still; only the elbows move.',
      'Chest up.',
      'Squeeze at the top.'
    ]::text[],
    array[
      'الميلان للخلف والتأرجح.',
      'تقديم الكوعين للأمام.',
      'إسقاط البار بسرعة.'
    ]::text[],
    array[
      'Leaning back and swinging.',
      'Letting the elbows travel forward.',
      'Dropping the bar quickly.'
    ]::text[],
    'إذا ضايقك المعصم مع البار المستقيم، استخدم البار المتعرّج (EZ) أو الدمبل.',
    'If a straight bar bothers your wrists, use an EZ-bar or dumbbells.',
    array['dumbbell-biceps-curl', 'band-biceps-curl']::text[], 3, '8-12', 75,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 230),
  ('hammer-curl', 'تبادل مطرقة (Hammer Curl)', 'Hammer Curl', 'biceps', array['forearms']::text[],
    'دمبلين', 'Two dumbbells', 'beginner', array['gym', 'home']::text[],
    array[
      'قف والدمبلين بجانب فخذيك وراحة اليد باتجاه الجسم.',
      'شدّ بطنك وانزل بكتفيك للأسفل.',
      'ارفع الدمبلين باتجاه الكتفين بدون ما تلفّ الكف.',
      'نزّل ببطء حتى تمتد ذراعاك.'
    ]::text[],
    array[
      'Stand with the dumbbells beside your thighs, palms facing your body.',
      'Brace your midsection and set your shoulders down.',
      'Curl the dumbbells toward your shoulders without rotating your palms.',
      'Lower slowly until your arms are straight.'
    ]::text[],
    array[
      'الإبهام للأعلى طول الحركة.',
      'الكوعان بجانب الخصر.',
      'المعصم على امتداد الساعد.'
    ]::text[],
    array[
      'Thumbs point up throughout.',
      'Elbows by your sides.',
      'Wrists in line with the forearms.'
    ]::text[],
    array[
      'التأرجح بالجسم.',
      'تقديم الكوعين للأمام.',
      'رفع الكتفين.'
    ]::text[],
    array[
      'Swinging the body.',
      'Moving the elbows forward.',
      'Shrugging.'
    ]::text[],
    'حافظ على جذعك مستقيماً بدون تقويس أسفل الظهر، وخفّف الوزن إذا بديت تتأرجح.',
    'Keep your torso upright without arching the lower back, and reduce the weight if you start to swing.',
    array['dumbbell-biceps-curl', 'band-biceps-curl']::text[], 3, '10-12', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library: Hammer Curl", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/10/hammer-curl/"}]'::jsonb,
    'unreviewed', 240),
  ('incline-dumbbell-curl', 'تبادل دمبل على بنش مائل (Incline Curl)', 'Incline Dumbbell Curl', 'biceps', array['forearms']::text[],
    'دمبلين وبنش مائل', 'Two dumbbells and an incline bench', 'intermediate', array['gym']::text[],
    array[
      'اضبط البنش على ميلان 45 إلى 60 درجة واجلس وظهرك ورأسك على المسند.',
      'خل ذراعيك متدليتين للأسفل وراحة اليد للأمام.',
      'ارفع الدمبلين بثني الكوعين وعضدك ثابت.',
      'نزّل ببطء حتى تمتد ذراعاك.'
    ]::text[],
    array[
      'Set the bench to 45-60 degrees and sit with your back and head against it.',
      'Let your arms hang straight down, palms forward.',
      'Curl the dumbbells up while your upper arms stay still.',
      'Lower slowly to a full stretch.'
    ]::text[],
    array[
      'الكوعان يأشران للأرض.',
      'كتفاك على المسند.',
      'وزن أخف من التبادل العادي.'
    ]::text[],
    array[
      'Elbows point to the floor.',
      'Shoulders stay on the pad.',
      'Use less weight than a standing curl.'
    ]::text[],
    array[
      'تقديم الكتفين للأمام.',
      'تحريك العضد مع الرفع.',
      'نزول سريع.'
    ]::text[],
    array[
      'Rolling the shoulders forward.',
      'Swinging the upper arms.',
      'Lowering too fast.'
    ]::text[],
    'وضع التمدد يحمّل مقدمة الكتف؛ ابدأ بوزن خفيف، وقلّل ميلان البنش إذا حسّيت بانزعاج.',
    'The stretched position loads the front of the shoulder; start light and make the bench more upright if it feels uncomfortable.',
    array['dumbbell-biceps-curl', 'band-biceps-curl']::text[], 3, '10-12', 75,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 250),
  ('cable-curl', 'تبادل كيبل (Cable Curl)', 'Cable Curl', 'biceps', array['forearms']::text[],
    'كيبل سفلي مع بار قصير', 'Low cable with a short bar', 'beginner', array['gym']::text[],
    array[
      'اضبط البكرة على أسفل مستوى وامسك البار وراحة اليد للأعلى.',
      'قف قريب من الجهاز وكوعاك بجانب جسمك.',
      'ارفع البار باتجاه الكتفين.',
      'نزّل ببطء بدون ما تريّح الوزن بالكامل.'
    ]::text[],
    array[
      'Set the pulley to the lowest position and hold the bar with palms up.',
      'Stand close to the machine with elbows at your sides.',
      'Curl the bar toward your shoulders.',
      'Lower slowly without letting the stack rest completely.'
    ]::text[],
    array[
      'شدّ مستمر على العضلة.',
      'الجذع ثابت.',
      'توقف ثانية في الأعلى.'
    ]::text[],
    array[
      'Keep constant tension.',
      'Torso still.',
      'Pause one second at the top.'
    ]::text[],
    array[
      'الرجوع للخلف بالجسم.',
      'رفع الكوعين.',
      'حركة سريعة ومتقطعة.'
    ]::text[],
    array[
      'Leaning back.',
      'Lifting the elbows.',
      'Fast, jerky reps.'
    ]::text[],
    'قف بثبات وخل ركبتيك مرتخيتين شوي، ولا تفلت المقبض فجأة.',
    'Stand firmly with soft knees, and never let go of the handle suddenly.',
    array['band-biceps-curl', 'dumbbell-biceps-curl']::text[], 3, '10-15', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 260),
  ('band-biceps-curl', 'تبادل بالحبل المطاطي', 'Resistance Band Biceps Curl', 'biceps', array['forearms']::text[],
    'حبل مطاطي', 'Resistance band', 'beginner', array['home']::text[],
    array[
      'قف على منتصف الحبل بقدم أو قدمين وامسك الطرفين وراحة اليد للأمام.',
      'ثبّت كوعيك بجانب خصرك.',
      'ارفع يديك باتجاه الكتفين.',
      'نزّل ببطء وقاوم سحب الحبل.'
    ]::text[],
    array[
      'Stand on the middle of the band with one or both feet and hold the ends, palms forward.',
      'Keep your elbows by your sides.',
      'Curl your hands toward your shoulders.',
      'Lower slowly, resisting the pull of the band.'
    ]::text[],
    array[
      'قف مستقيم.',
      'تحكّم في النزول.',
      'وسّع وقفتك لزيادة المقاومة.'
    ]::text[],
    array[
      'Stand tall.',
      'Control the way down.',
      'Widen your stance to add resistance.'
    ]::text[],
    array[
      'ترك الحبل يسحب يديك للأسفل بسرعة.',
      'تقديم الكوعين.',
      'الميلان للخلف.'
    ]::text[],
    array[
      'Letting the band pull your hands down fast.',
      'Elbows drifting forward.',
      'Leaning back.'
    ]::text[],
    'تأكد إن الحبل ثابت تحت منتصف قدمك حتى ما يفلت، وافحصه من الشقوق.',
    'Make sure the band is secure under the middle of your foot so it cannot slip, and check it for cracks.',
    array['dumbbell-biceps-curl', 'hammer-curl']::text[], 3, '12-15', 45,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 270),
  ('chin-up', 'عقلة بقبضة معكوسة (Chin-up)', 'Chin-Up', 'biceps', array['back', 'forearms']::text[],
    'بار عقلة', 'Pull-up bar', 'advanced', array['gym', 'home']::text[],
    array[
      'امسك البار بقبضة بعرض الكتفين وراحة اليد باتجاهك، وتعلّق وذراعاك ممدودتان.',
      'شدّ بطنك وانزل بكتفيك للأسفل.',
      'اسحب جسمك حتى يتجاوز ذقنك البار.',
      'انزل ببطء حتى تمتد ذراعاك.'
    ]::text[],
    array[
      'Grip the bar shoulder-width with palms facing you and hang with straight arms.',
      'Brace your midsection and pull your shoulders down.',
      'Pull up until your chin is over the bar.',
      'Lower slowly to straight arms.'
    ]::text[],
    array[
      'الكوعان قريبان من الجسم.',
      'صدرك باتجاه البار.',
      'بدون تأرجح.'
    ]::text[],
    array[
      'Elbows stay close to your body.',
      'Chest toward the bar.',
      'No swinging.'
    ]::text[],
    array[
      'ركل الرجلين للصعود.',
      'النزول السريع.',
      'عدم مدّ الذراعين في الأسفل.'
    ]::text[],
    array[
      'Kicking the legs to get up.',
      'Dropping down fast.',
      'Not straightening the arms at the bottom.'
    ]::text[],
    'تأكد من ثبات البار. إذا كانت الحركة صعبة، استخدم رباط مساعد أو تمرّن على النزول البطيء فقط، ووقّف عند ألم الكوع.',
    'Check the bar is secure. If it is too hard, use an assistance band or practise slow lowering only, and stop if your elbows hurt.',
    array['lat-pulldown', 'band-biceps-curl', 'dumbbell-biceps-curl']::text[], 3, '4-8', 120,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 280),
  -- ===== triceps =====
  ('triceps-pushdown', 'ترايسبس كيبل للأسفل (Pushdown)', 'Cable Triceps Pushdown', 'triceps', '{}'::text[],
    'كيبل علوي مع بار أو حبل', 'High cable with bar or rope', 'beginner', array['gym']::text[],
    array[
      'اضبط البكرة على أعلى مستوى وامسك البار أو الحبل.',
      'قف قريب من الجهاز مع ميلان بسيط للأمام، وكوعاك بجانب خصرك.',
      'ادفع المقبض للأسفل حتى تمتد ذراعاك.',
      'ارجع ببطء حتى يصير الساعد أعلى من مستوى الكوع شوي.'
    ]::text[],
    array[
      'Set the pulley high and take hold of the bar or rope.',
      'Stand close with a slight forward lean and your elbows by your sides.',
      'Push the handle down until your arms are straight.',
      'Return slowly until your forearms are just above elbow level.'
    ]::text[],
    array[
      'الكوع ثابت مثل المفصلة.',
      'كتفاك للأسفل.',
      'اعصر العضلة في الأسفل.'
    ]::text[],
    array[
      'Elbows fixed like a hinge.',
      'Shoulders down.',
      'Squeeze at the bottom.'
    ]::text[],
    array[
      'تحريك الكوعين للأمام والخلف.',
      'الانحناء فوق المقبض ودفعه بوزن الجسم.',
      'ثني المعصمين.'
    ]::text[],
    array[
      'Letting the elbows swing forward and back.',
      'Hunching over the handle and pushing with body weight.',
      'Bending the wrists.'
    ]::text[],
    'اختر وزن يخليك تثبّت كوعيك، وأرجع المقبض بتحكم ولا تفلته.',
    'Choose a load that lets you keep your elbows still, and return the handle under control rather than releasing it.',
    array['bench-dip', 'overhead-triceps-extension']::text[], 3, '10-15', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 290),
  ('overhead-triceps-extension', 'ترايسبس دمبل خلف الرأس', 'Overhead Dumbbell Triceps Extension', 'triceps', '{}'::text[],
    'دمبل واحد', 'One dumbbell', 'beginner', array['gym', 'home']::text[],
    array[
      'اجلس أو قف وامسك دمبل واحد بيديك الثنتين وارفعه فوق رأسك.',
      'خل عضديك قريبين من رأسك والكوعين يأشران للأعلى.',
      'نزّل الدمبل ببطء خلف رأسك بثني الكوعين.',
      'مدّ ذراعيك للأعلى من جديد.'
    ]::text[],
    array[
      'Sit or stand holding one dumbbell in both hands and raise it overhead.',
      'Keep your upper arms close to your head with elbows pointing up.',
      'Lower the dumbbell slowly behind your head by bending your elbows.',
      'Straighten your arms back up.'
    ]::text[],
    array[
      'الكوعان ما ينفتحون للجانبين.',
      'شدّ بطنك والأضلاع للأسفل.',
      'حركة بطيئة ومتحكم فيها.'
    ]::text[],
    array[
      'Elbows do not flare out.',
      'Midsection tight, ribs down.',
      'Slow and controlled.'
    ]::text[],
    array[
      'تقويس أسفل الظهر.',
      'فتح الكوعين كثير.',
      'إنزال الدمبل بسرعة باتجاه الرقبة.'
    ]::text[],
    array[
      'Arching the lower back.',
      'Letting the elbows spread wide.',
      'Dropping the dumbbell quickly toward the neck.'
    ]::text[],
    'امسك الدمبل بإحكام وابدأ بوزن خفيف؛ إذا ضايقك الكتف في هذا الوضع اختر تمرين ثاني للترايسبس.',
    'Hold the dumbbell securely and start light; if the overhead position bothers your shoulders, choose another triceps exercise.',
    array['triceps-pushdown', 'bench-dip']::text[], 3, '10-12', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 300),
  ('lying-triceps-extension', 'ترايسبس بار مستلقي (Skull Crusher)', 'Lying Triceps Extension', 'triceps', '{}'::text[],
    'بار متعرّج (EZ) أو بار وبنش مستوٍ', 'EZ-bar or barbell and a flat bench', 'intermediate', array['gym']::text[],
    array[
      'انسدح على البنش وقدماك على الأرض، وامسك البار فوق صدرك وذراعاك ممدودتان.',
      'ثبّت عضديك بشكل عمودي تقريباً.',
      'اثنِ كوعيك ونزّل البار ببطء باتجاه الجبهة أو فوقها بشوي.',
      'مدّ ذراعيك وارجع لوضع البداية.'
    ]::text[],
    array[
      'Lie on the bench with feet on the floor and hold the bar above your chest with straight arms.',
      'Keep your upper arms close to vertical.',
      'Bend your elbows and lower the bar slowly toward, or just above, your forehead.',
      'Straighten your arms back to the start.'
    ]::text[],
    array[
      'الكوعان بعرض الكتفين.',
      'المعصم مستقيم.',
      'العضد ثابت والحركة من الكوع.'
    ]::text[],
    array[
      'Elbows shoulder-width apart.',
      'Wrists straight.',
      'Upper arms still; move at the elbow.'
    ]::text[],
    array[
      'فتح الكوعين للجانبين.',
      'تحريك العضدين للخلف والأمام.',
      'النزول السريع فوق الوجه.'
    ]::text[],
    array[
      'Flaring the elbows outward.',
      'Rocking the upper arms back and forth.',
      'Lowering quickly over the face.'
    ]::text[],
    'البار يمرّ فوق وجهك؛ استخدم وزن تتحكم فيه بالكامل وقبضة محكمة، ويفضّل وجود مساعد.',
    'The bar passes over your face; use a weight you fully control, a firm grip, and ideally a spotter.',
    array['overhead-triceps-extension', 'triceps-pushdown']::text[], 3, '8-12', 75,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library: Lying Barbell Triceps Extensions", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/36/lying-barbell-triceps-extensions/"}]'::jsonb,
    'unreviewed', 310),
  ('close-grip-bench-press', 'بنش برس قبضة ضيقة (Close-Grip Bench)', 'Close-Grip Bench Press', 'triceps', array['chest', 'shoulders']::text[],
    'بار وبنش مستوٍ مع حامل', 'Barbell, flat bench and rack', 'intermediate', array['gym']::text[],
    array[
      'انسدح على البنش وامسك البار بقبضة بعرض الكتفين تقريباً.',
      'ارفع البار من الحامل وثبّته فوق صدرك.',
      'نزّل البار إلى أسفل الصدر والكوعان قريبان من جسمك.',
      'ادفع البار للأعلى حتى تمتد ذراعاك.'
    ]::text[],
    array[
      'Lie on the bench and grip the bar at about shoulder width.',
      'Unrack the bar and hold it above your chest.',
      'Lower the bar to your lower chest with elbows close to your ribs.',
      'Press the bar up until your arms are straight.'
    ]::text[],
    array[
      'قدماك تدفعان الأرض.',
      'مؤخرتك على البنش.',
      'المعصم فوق الكوع.'
    ]::text[],
    array[
      'Feet press into the floor.',
      'Hips stay on the bench.',
      'Wrists over elbows.'
    ]::text[],
    array[
      'قبضة ضيقة جداً تضغط على المعصم.',
      'فتح الكوعين للجانبين.',
      'ارتداد البار من الصدر.'
    ]::text[],
    array[
      'A grip so narrow it strains the wrists.',
      'Flaring the elbows out.',
      'Bouncing the bar off the chest.'
    ]::text[],
    'لا تضيّق القبضة أكثر من عرض الكتفين، واستخدم مساعد أو قضبان أمان مع الأوزان الثقيلة.',
    'Do not grip narrower than shoulder width, and use a spotter or safety bars for heavy sets.',
    array['close-grip-push-up', 'triceps-pushdown']::text[], 3, '6-10', 120,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library: Close-grip Bench Press", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/311/close-grip-bench-press/"}]'::jsonb,
    'unreviewed', 320),
  ('bench-dip', 'متوازي على الكرسي (Bench Dip)', 'Bench Dip', 'triceps', array['shoulders', 'chest']::text[],
    'بنش أو كرسي ثابت', 'Bench or sturdy chair', 'beginner', array['home', 'gym']::text[],
    array[
      'اجلس على طرف البنش وحط كفّيك بجانب وركك وأصابعك للأمام.',
      'قدّم جسمك عن البنش وركبتاك مثنيتان وقدماك على الأرض.',
      'انزل بثني الكوعين حتى يصير العضد شبه موازي للأرض أو أقل حسب راحتك.',
      'ادفع بكفّيك وارجع للأعلى.'
    ]::text[],
    array[
      'Sit on the edge of the bench with your hands beside your hips, fingers forward.',
      'Slide your hips off the bench with knees bent and feet on the floor.',
      'Bend your elbows and lower until your upper arms are near parallel to the floor, or less if that is more comfortable.',
      'Press through your hands to come back up.'
    ]::text[],
    array[
      'ظهرك قريب من البنش.',
      'الكوعان يأشران للخلف.',
      'كتفاك بعيدان عن أذنيك.'
    ]::text[],
    array[
      'Keep your back close to the bench.',
      'Elbows point straight back.',
      'Shoulders away from your ears.'
    ]::text[],
    array[
      'النزول العميق اللي يضغط على مقدمة الكتف.',
      'إبعاد الجسم عن البنش.',
      'فتح الكوعين للجانبين.'
    ]::text[],
    array[
      'Going so deep that the front of the shoulder is stressed.',
      'Letting the body drift away from the bench.',
      'Flaring the elbows out.'
    ]::text[],
    'تأكد إن الكرسي ما يتحرك، وانزل لمدى مريح فقط؛ تجنّب التمرين إذا عندك ألم في الكتف.',
    'Make sure the chair cannot slide, lower only through a comfortable range, and skip this exercise if you have shoulder pain.',
    array['triceps-pushdown', 'close-grip-push-up', 'overhead-triceps-extension']::text[], 3, '8-12', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 330),
  ('close-grip-push-up', 'ضغط بقبضة ضيقة', 'Close-Grip Push-Up', 'triceps', array['chest', 'shoulders']::text[],
    'وزن الجسم', 'Bodyweight', 'intermediate', array['home']::text[],
    array[
      'خذ وضع الضغط وكفّاك تحت الكتفين مباشرة أو أضيق شوي.',
      'شدّ بطنك ومؤخرتك وخل جسمك خط مستقيم.',
      'انزل والكوعان ملاصقان لجانبي جسمك.',
      'ادفع للأعلى حتى تمتد ذراعاك.'
    ]::text[],
    array[
      'Get into a push-up position with your hands directly under your shoulders or slightly narrower.',
      'Tighten your midsection and glutes to hold a straight line.',
      'Lower with your elbows brushing your sides.',
      'Press up until your arms are straight.'
    ]::text[],
    array[
      'الكوعان يأشران للخلف.',
      'الجسم قطعة واحدة.',
      'انزل على الركبتين إذا كان صعب.'
    ]::text[],
    array[
      'Elbows point back.',
      'Body moves as one piece.',
      'Drop to your knees if it is too hard.'
    ]::text[],
    array[
      'هبوط الخصر.',
      'فتح الكوعين.',
      'عدّات قصيرة.'
    ]::text[],
    array[
      'Sagging hips.',
      'Flaring the elbows.',
      'Short reps.'
    ]::text[],
    'إذا حسّيت بضغط على المعصم أو الكوع، وسّع وضع اليدين شوي أو سوّ التمرين على الركبتين.',
    'If your wrists or elbows feel strained, widen your hands slightly or do the exercise from your knees.',
    array['bench-dip', 'close-grip-bench-press', 'knee-push-up']::text[], 3, '6-12', 75,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 340),
  ('parallel-bar-dip', 'متوازي (Dips)', 'Parallel Bar Dip', 'triceps', array['chest', 'shoulders']::text[],
    'جهاز المتوازي', 'Parallel dip bars', 'advanced', array['gym']::text[],
    array[
      'امسك القضيبين وارفع جسمك حتى تمتد ذراعاك وكتفاك للأسفل.',
      'اثنِ ركبتيك أو خل رجليك مستقيمتين تحتك، ومِل للأمام شوي.',
      'انزل بثني الكوعين حتى يصير العضد موازي للأرض تقريباً.',
      'ادفع للأعلى حتى تمتد ذراعاك.'
    ]::text[],
    array[
      'Hold the bars and support yourself with straight arms and shoulders down.',
      'Bend your knees or keep your legs under you, leaning forward slightly.',
      'Lower by bending your elbows until your upper arms are about parallel to the floor.',
      'Press up to straight arms.'
    ]::text[],
    array[
      'الكوعان قريبان من الجسم للتركيز على الترايسبس.',
      'صدرك مرفوع.',
      'نزول متحكم فيه.'
    ]::text[],
    array[
      'Keep elbows close to your body to emphasise the triceps.',
      'Chest up.',
      'Controlled descent.'
    ]::text[],
    array[
      'النزول العميق جداً.',
      'رفع الكتفين باتجاه الأذنين.',
      'التأرجح بالرجلين.'
    ]::text[],
    array[
      'Dropping too deep.',
      'Letting the shoulders shrug toward the ears.',
      'Swinging the legs.'
    ]::text[],
    'تمرين متقدم يحمّل الكتف؛ لا تنزل أكثر من مدى مريح، واستخدم الجهاز المساعد أو تمرين الكرسي إذا ما قدرت تتحكم بالنزول.',
    'An advanced exercise that loads the shoulders; do not go deeper than is comfortable, and use an assisted machine or bench dips if you cannot control the descent.',
    array['bench-dip', 'triceps-pushdown', 'close-grip-push-up']::text[], 3, '5-10', 120,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 350),
  -- ===== forearms =====
  ('wrist-curl', 'ثني المعصم (Wrist Curl)', 'Wrist Curl', 'forearms', '{}'::text[],
    'دمبل خفيف (أو قنينة ماي) وبنش أو كرسي', 'Light dumbbell (or water bottle) and a bench or chair', 'beginner', array['gym', 'home']::text[],
    array[
      'اجلس وحط ساعدك على فخذك أو على البنش وراحة اليد للأعلى، والمعصم خارج الحافة.',
      'امسك الدمبل وخل معصمك ينزل للأسفل ببطء.',
      'اثنِ معصمك للأعلى لأقصى مدى مريح.',
      'نزّل ببطء، وكمّل العدّات ثم بدّل اليد.'
    ]::text[],
    array[
      'Sit with your forearm resting on your thigh or a bench, palm up, wrist just past the edge.',
      'Hold the dumbbell and let your wrist lower slowly.',
      'Curl your wrist up as far as is comfortable.',
      'Lower slowly, finish your reps, then switch hands.'
    ]::text[],
    array[
      'الساعد ثابت على السطح.',
      'الحركة من المعصم فقط.',
      'حركة بطيئة.'
    ]::text[],
    array[
      'Forearm stays flat on the support.',
      'Only the wrist moves.',
      'Move slowly.'
    ]::text[],
    array[
      'رفع الساعد عن السطح.',
      'وزن ثقيل وحركة سريعة.',
      'مدى حركة قصير جداً.'
    ]::text[],
    array[
      'Lifting the forearm off the support.',
      'Heavy weight and fast reps.',
      'A very short range of motion.'
    ]::text[],
    'ابدأ بوزن خفيف جداً، ووقّف إذا حسّيت بألم أو تنميل في المعصم.',
    'Start very light, and stop if you feel pain or tingling in the wrist.',
    array['reverse-wrist-curl', 'farmer-carry']::text[], 3, '12-15', 45,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 360),
  ('reverse-wrist-curl', 'ثني المعصم المعكوس (Reverse Wrist Curl)', 'Reverse Wrist Curl', 'forearms', '{}'::text[],
    'دمبل خفيف وبنش أو كرسي', 'Light dumbbell and a bench or chair', 'beginner', array['gym', 'home']::text[],
    array[
      'اجلس وحط ساعدك على فخذك أو البنش وراحة اليد للأسفل، والمعصم خارج الحافة.',
      'امسك الدمبل وخل يدك تنزل للأسفل.',
      'ارفع ظهر يدك للأعلى لأقصى مدى مريح.',
      'نزّل ببطء ثم بدّل اليد بعد ما تخلص.'
    ]::text[],
    array[
      'Sit with your forearm on your thigh or a bench, palm down, wrist past the edge.',
      'Hold the dumbbell and let your hand lower.',
      'Lift the back of your hand up as far as is comfortable.',
      'Lower slowly, and switch hands when done.'
    ]::text[],
    array[
      'الساعد ما يتحرك.',
      'وزن أخف من ثني المعصم العادي.',
      'قبضة ثابتة بدون شدّ زايد.'
    ]::text[],
    array[
      'Forearm does not move.',
      'Use less weight than the regular wrist curl.',
      'Firm grip without over-squeezing.'
    ]::text[],
    array[
      'استخدام الكوع أو الكتف للرفع.',
      'حركة سريعة.',
      'وزن ثقيل.'
    ]::text[],
    array[
      'Using the elbow or shoulder to lift.',
      'Rushing the reps.',
      'Going too heavy.'
    ]::text[],
    'عضلات ظهر الساعد صغيرة؛ استخدم وزن خفيف، ووقّف إذا حسّيت بألم في الكوع من الخارج أو المعصم.',
    'The muscles on the back of the forearm are small; use a light weight and stop if you feel pain on the outside of the elbow or in the wrist.',
    array['wrist-curl', 'reverse-curl']::text[], 3, '12-15', 45,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 370),
  ('farmer-carry', 'مشية المزارع (Farmer Carry)', 'Farmer Carry', 'forearms', array['shoulders', 'abs', 'back']::text[],
    'دمبلين أو كتل بل (أو أكياس ثقيلة متساوية في البيت)', 'Two dumbbells or kettlebells (or two evenly loaded bags at home)', 'intermediate', array['gym', 'home']::text[],
    array[
      'حط وزن على كل جانب، وانزل بثني الوركين والركبتين وظهرك مستقيم وامسكهما.',
      'قف مستقيم والوزنان بجانب جسمك.',
      'امشِ بخطوات قصيرة وثابتة للمسافة أو الوقت المحدد.',
      'وقّف، وانزل بنفس طريقة الرفع وحط الوزنين على الأرض.'
    ]::text[],
    array[
      'Place a weight at each side, bend at the hips and knees with a straight back, and grip them.',
      'Stand tall with the weights at your sides.',
      'Walk with short, steady steps for the set distance or time.',
      'Stop, then lower the weights to the floor the same way you picked them up.'
    ]::text[],
    array[
      'صدرك مرفوع وكتفاك للخلف.',
      'شدّ بطنك ولا تميل لأي جهة.',
      'قبضة قوية وعينك للأمام.'
    ]::text[],
    array[
      'Chest up, shoulders back.',
      'Brace and do not lean to either side.',
      'Strong grip, eyes forward.'
    ]::text[],
    array[
      'تقويس الظهر عند رفع الوزن من الأرض.',
      'خطوات طويلة وسريعة.',
      'رفع الكتفين أو ترك الوزن يتأرجح.'
    ]::text[],
    array[
      'Rounding the back when picking the weights up.',
      'Long, rushed steps.',
      'Shrugging or letting the weights swing.'
    ]::text[],
    'تأكد إن الطريق فاضي قدّامك، وحط الوزن على الأرض قبل ما تفلت قبضتك.',
    'Make sure your path is clear, and set the weights down before your grip gives out.',
    array['dead-hang', 'wrist-curl']::text[], 3, '20-40s', 90,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library: Farmer''s Carry", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/359/farmer-s-carry/"}]'::jsonb,
    'unreviewed', 380),
  ('reverse-curl', 'تبادل بقبضة معكوسة (Reverse Curl)', 'Reverse Curl', 'forearms', array['biceps']::text[],
    'بار متعرّج (EZ) أو دمبلين', 'EZ-bar or two dumbbells', 'intermediate', array['gym']::text[],
    array[
      'قف وامسك البار بقبضة بعرض الكتفين وراحة اليد للأسفل.',
      'ثبّت كوعيك بجانب خصرك.',
      'ارفع البار بثني الكوعين حتى يقترب من الكتفين.',
      'نزّل ببطء حتى تمتد ذراعاك.'
    ]::text[],
    array[
      'Stand holding the bar at shoulder width with palms facing down.',
      'Keep your elbows by your sides.',
      'Curl the bar up toward your shoulders.',
      'Lower slowly to straight arms.'
    ]::text[],
    array[
      'المعصم مستقيم.',
      'وزن أخف من التبادل العادي.',
      'الكوعان ثابتان.'
    ]::text[],
    array[
      'Wrists stay straight.',
      'Use less weight than a regular curl.',
      'Elbows fixed.'
    ]::text[],
    array[
      'ثني المعصمين للخلف.',
      'التأرجح بالجسم.',
      'فتح الكوعين للجانبين.'
    ]::text[],
    array[
      'Letting the wrists bend back.',
      'Swinging the body.',
      'Letting the elbows flare.'
    ]::text[],
    'إذا ضايقك المعصم مع البار المستقيم، استخدم البار المتعرّج أو الدمبل وخفّف الوزن.',
    'If a straight bar bothers your wrists, use an EZ-bar or dumbbells and reduce the load.',
    array['hammer-curl', 'reverse-wrist-curl']::text[], 3, '10-12', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 390),
  ('dead-hang', 'التعلّق على البار (Dead Hang)', 'Dead Hang', 'forearms', array['back', 'shoulders']::text[],
    'بار عقلة', 'Pull-up bar', 'intermediate', array['gym', 'home']::text[],
    array[
      'امسك البار بقبضة بعرض الكتفين وراحة اليد للأمام.',
      'ارفع قدميك عن الأرض أو عن الصندوق بهدوء وتعلّق وذراعاك ممدودتان.',
      'شدّ كتفيك للأسفل شوي وخل جسمك ثابت.',
      'ثبّت للوقت المحدد، ثم انزل بقدميك بتحكم.'
    ]::text[],
    array[
      'Grip the bar at shoulder width, palms facing away.',
      'Gently take your feet off the floor or box and hang with straight arms.',
      'Draw your shoulders down slightly and keep your body still.',
      'Hold for the set time, then step down under control.'
    ]::text[],
    array[
      'لفّ إبهامك حول البار.',
      'تنفّس بشكل طبيعي.',
      'بدون تأرجح.'
    ]::text[],
    array[
      'Wrap your thumbs around the bar.',
      'Breathe normally.',
      'No swinging.'
    ]::text[],
    array[
      'ترك الكتفين مرتخيين بالكامل عند الأذنين.',
      'القفز من البار عند التعب.',
      'حبس النفس.'
    ]::text[],
    array[
      'Letting the shoulders hang completely loose up by the ears.',
      'Jumping off the bar when tired.',
      'Holding your breath.'
    ]::text[],
    'تأكد من ثبات البار وإن قدميك قريبتان من الأرض أو من صندوق. تجنّب التمرين إذا عندك إصابة في الكتف.',
    'Check the bar is secure and that your feet are close to the floor or a box. Avoid this exercise if you have a shoulder injury.',
    array['farmer-carry', 'wrist-curl']::text[], 3, '15-30s', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 400),
  ('plate-pinch-hold', 'مسك الصفيحة بالأصابع (Plate Pinch)', 'Plate Pinch Hold', 'forearms', '{}'::text[],
    'صفيحة وزن (أو كتاب ثقيل في البيت)', 'Weight plate (or a heavy book at home)', 'beginner', array['gym', 'home']::text[],
    array[
      'قف وامسك الصفيحة من حافتها بين الإبهام من جهة وباقي الأصابع من الجهة الثانية.',
      'خل ذراعك ممدودة بجانب جسمك.',
      'ثبّت للوقت المحدد وأنت واقف مستقيم.',
      'حط الصفيحة على الأرض بهدوء وبدّل اليد.'
    ]::text[],
    array[
      'Stand and pinch the plate by its edge between your thumb on one side and fingers on the other.',
      'Let your arm hang straight by your side.',
      'Hold for the set time while standing tall.',
      'Set the plate down gently and switch hands.'
    ]::text[],
    array[
      'اضغط بالإبهام بقوة.',
      'كتفاك متساويان.',
      'تنفّس بشكل طبيعي.'
    ]::text[],
    array[
      'Squeeze hard with the thumb.',
      'Keep your shoulders level.',
      'Breathe normally.'
    ]::text[],
    array[
      'سند الصفيحة على الفخذ.',
      'الميلان لجهة الوزن.',
      'الاستمرار حتى تطيح الصفيحة.'
    ]::text[],
    array[
      'Resting the plate against the thigh.',
      'Leaning toward the weight.',
      'Holding until the plate drops.'
    ]::text[],
    'أبعد قدميك عن مكان سقوط الصفيحة، ووقّف قبل ما تفلت من يدك.',
    'Keep your feet clear of where the plate could fall, and stop before it slips from your hand.',
    array['farmer-carry', 'wrist-curl']::text[], 3, '15-30s', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 410),
  -- ===== hips =====
  ('bodyweight-squat', 'سكوات بوزن الجسم', 'Bodyweight Squat', 'hips', array['abs', 'calf']::text[],
    'وزن الجسم', 'Bodyweight', 'beginner', array['home', 'gym']::text[],
    array[
      'قف والقدمان أوسع من الورك شوي وأصابع القدم للخارج قليلاً.',
      'شدّ بطنك وارفع صدرك.',
      'ادفع وركك للخلف واثنِ ركبتيك كأنك تجلس على كرسي.',
      'انزل حتى يصير الفخذ موازي للأرض تقريباً أو لأعمق مدى تحافظ فيه على استقامة ظهرك.',
      'ادفع الأرض بقدميك وارجع للوقوف.'
    ]::text[],
    array[
      'Stand with feet a little wider than your hips and toes turned out slightly.',
      'Brace your midsection and lift your chest.',
      'Push your hips back and bend your knees as if sitting onto a chair.',
      'Lower until your thighs are about parallel to the floor, or as deep as you can keep your back straight.',
      'Push the floor away and stand back up.'
    ]::text[],
    array[
      'الركبتان باتجاه أصابع القدم.',
      'الكعب ثابت على الأرض.',
      'صدرك مرفوع وعينك للأمام.'
    ]::text[],
    array[
      'Knees track in line with your toes.',
      'Heels stay down.',
      'Chest up, eyes forward.'
    ]::text[],
    array[
      'دخول الركبتين للداخل.',
      'رفع الكعبين عن الأرض.',
      'تقويس الظهر والميلان للأمام كثير.'
    ]::text[],
    array[
      'Knees caving inward.',
      'Heels lifting off the floor.',
      'Rounding the back and leaning far forward.'
    ]::text[],
    'انزل لمدى مريح بدون ألم في الركبة، وتمسّك بسطح ثابت إذا تحتاج توازن.',
    'Squat only as deep as is pain-free for your knees, and hold a stable support if you need help balancing.',
    array['goblet-squat', 'glute-bridge', 'lunge']::text[], 3, '12-15', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library: Bodyweight Squat", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/135/bodyweight-squat/"}]'::jsonb,
    'unreviewed', 420),
  ('goblet-squat', 'سكوات بالدمبل قدّام الصدر (Goblet Squat)', 'Goblet Squat', 'hips', array['abs', 'calf']::text[],
    'دمبل أو كتل بل', 'One dumbbell or kettlebell', 'beginner', array['gym', 'home']::text[],
    array[
      'امسك الدمبل بشكل عمودي قدّام صدرك بيديك الثنتين والكوعان للأسفل.',
      'قف والقدمان بعرض الكتفين أو أوسع شوي.',
      'انزل بثني الوركين والركبتين وصدرك مرفوع.',
      'ادفع بقدميك وارجع للوقوف.'
    ]::text[],
    array[
      'Hold the dumbbell upright against your chest with both hands, elbows pointing down.',
      'Stand with feet shoulder-width apart or slightly wider.',
      'Lower by bending your hips and knees, keeping your chest up.',
      'Drive through your feet to stand.'
    ]::text[],
    array[
      'الوزن ملاصق للصدر.',
      'الركبتان مفتوحتان باتجاه أصابع القدم.',
      'القدم كلها على الأرض.'
    ]::text[],
    array[
      'Weight stays against your chest.',
      'Knees open in line with your toes.',
      'Whole foot on the floor.'
    ]::text[],
    array[
      'سقوط الصدر للأمام.',
      'دخول الركبتين للداخل.',
      'رفع الكعبين.'
    ]::text[],
    array[
      'Chest dropping forward.',
      'Knees caving in.',
      'Heels lifting.'
    ]::text[],
    'اختر وزن تقدر تمسكه بثبات قدّام صدرك، ونزّله للأرض بثني الركبتين مو بتقويس الظهر.',
    'Choose a weight you can hold securely at your chest, and set it down by bending your knees, not by rounding your back.',
    array['bodyweight-squat', 'barbell-back-squat']::text[], 3, '8-12', 90,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 430),
  ('barbell-back-squat', 'سكوات بالبار (Back Squat)', 'Barbell Back Squat', 'hips', array['abs', 'back', 'calf']::text[],
    'بار وحامل سكوات', 'Barbell and squat rack', 'advanced', array['gym']::text[],
    array[
      'اضبط البار على الحامل تحت مستوى الكتف شوي، وادخل تحته وحطه على أعلى الظهر.',
      'امسك البار بقبضة أوسع من الكتفين، وارفع صدرك وضمّ لوحي الكتف.',
      'ارفع البار وارجع خطوة أو خطوتين، والقدمان بعرض الكتفين أو أوسع شوي.',
      'خذ نفس وشدّ بطنك، وانزل بالجلوس للخلف وللأسفل وصدرك مرفوع.',
      'ادفع الأرض وارجع للوقوف، ثم رجّع البار للحامل بتحكم.'
    ]::text[],
    array[
      'Set the bar in the rack just below shoulder height, step under it and rest it across your upper back.',
      'Grip wider than your shoulders, lift your chest and squeeze your shoulder blades together.',
      'Stand the bar up, take a step or two back, feet shoulder-width apart or slightly wider.',
      'Take a breath, brace, and sit back and down with your chest up.',
      'Drive the floor away to stand, then walk the bar back into the rack under control.'
    ]::text[],
    array[
      'الركبتان باتجاه أصابع القدم.',
      'الظهر مستقيم طول الحركة.',
      'الوزن على منتصف القدم.'
    ]::text[],
    array[
      'Knees track over your toes.',
      'Back stays straight throughout.',
      'Weight over the middle of the foot.'
    ]::text[],
    array[
      'تقويس أسفل الظهر في الأسفل.',
      'دخول الركبتين للداخل.',
      'ارتفاع الورك أسرع من الصدر.',
      'رفع الكعبين.'
    ]::text[],
    array[
      'Lower back rounding at the bottom.',
      'Knees caving inward.',
      'Hips shooting up faster than the chest.',
      'Heels lifting.'
    ]::text[],
    'استخدم حامل فيه قضبان أمان بارتفاع مناسب أو مساعد، وتعلّم الحركة بوزن خفيف مع مدرب قبل زيادة الحمل.',
    'Use a rack with safety bars set at the right height or a spotter, and learn the movement light with a coach before adding load.',
    array['goblet-squat', 'bodyweight-squat']::text[], 3, '5-8', 150,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library: Back Squat", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/11/back-squat/"}]'::jsonb,
    'unreviewed', 440),
  ('romanian-deadlift', 'ديدلفت روماني (Romanian Deadlift)', 'Romanian Deadlift', 'hips', array['back', 'forearms']::text[],
    'بار أو دمبلين', 'Barbell or two dumbbells', 'intermediate', array['gym']::text[],
    array[
      'قف والقدمان بعرض الورك وامسك البار قدّام فخذيك.',
      'اثنِ ركبتيك شوي وثبّت هالزاوية، وشدّ بطنك.',
      'ادفع وركك للخلف ونزّل البار ملاصق لرجليك وظهرك مستقيم.',
      'وقّف لما تحسّ بشدّ واضح في الفخذ الخلفي، غالباً تحت الركبة بشوي.',
      'ادفع وركك للأمام وارجع للوقوف.'
    ]::text[],
    array[
      'Stand with feet hip-width apart, holding the bar against the front of your thighs.',
      'Soften your knees slightly, keep that angle, and brace.',
      'Push your hips back and slide the bar down your legs with a straight back.',
      'Stop when you feel a clear stretch in the back of your thighs, usually just below the knees.',
      'Drive your hips forward to stand tall.'
    ]::text[],
    array[
      'الحركة من الورك مو من الظهر.',
      'البار قريب من جسمك.',
      'الرقبة على امتداد الظهر.'
    ]::text[],
    array[
      'The movement comes from the hips, not the back.',
      'Bar stays close to your body.',
      'Neck in line with your spine.'
    ]::text[],
    array[
      'تقويس الظهر للوصول لأسفل.',
      'ثني الركبتين كثير وتحويله لسكوات.',
      'ابتعاد البار عن الرجلين.'
    ]::text[],
    array[
      'Rounding the back to reach lower.',
      'Bending the knees a lot and turning it into a squat.',
      'Letting the bar drift away from the legs.'
    ]::text[],
    'نزّل البار لحد ما تقدر تحافظ على استقامة ظهرك فقط، وابدأ بوزن خفيف حتى تتقن حركة الورك.',
    'Lower the bar only as far as you can keep your back straight, and start light until you have mastered the hip hinge.',
    array['glute-bridge', 'barbell-hip-thrust']::text[], 3, '8-10', 120,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library: Romanian Deadlift", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/317/romanian-deadlift/"}]'::jsonb,
    'unreviewed', 450),
  ('barbell-hip-thrust', 'هيب ثرست بالبار (Hip Thrust)', 'Barbell Hip Thrust', 'hips', array['abs']::text[],
    'بار وبنش ووسادة للبار', 'Barbell, bench and a bar pad', 'intermediate', array['gym']::text[],
    array[
      'اجلس على الأرض وأعلى ظهرك مسنود على حافة البنش، ودحرج البار فوق وركك مع وسادة.',
      'اثنِ ركبتيك وحط قدميك على الأرض بعرض الورك.',
      'ادفع بكعبيك وارفع وركك حتى يصير جسمك خط مستقيم من الكتف للركبة.',
      'اعصر عضلات المؤخرة لحظة، ثم انزل ببطء.'
    ]::text[],
    array[
      'Sit on the floor with your upper back against the edge of the bench and roll the padded bar over your hips.',
      'Bend your knees and plant your feet hip-width apart.',
      'Drive through your heels and lift your hips until your body is straight from shoulders to knees.',
      'Squeeze your glutes briefly, then lower slowly.'
    ]::text[],
    array[
      'الذقن للأسفل والأضلاع مشدودة.',
      'الساق عمودية في أعلى الحركة.',
      'ادفع بالكعب.'
    ]::text[],
    array[
      'Chin tucked, ribs down.',
      'Shins vertical at the top.',
      'Push through your heels.'
    ]::text[],
    array[
      'تقويس أسفل الظهر في الأعلى.',
      'القدمان بعيدتان أو قريبتان كثير.',
      'الدفع بأصابع القدم.'
    ]::text[],
    array[
      'Over-arching the lower back at the top.',
      'Feet set too far away or too close.',
      'Pushing through the toes.'
    ]::text[],
    'تأكد إن البنش ثابت وما يزحف، واستخدم وسادة تحت البار؛ وقّف الرفع لما يصير الورك بمستوى الكتف والركبة.',
    'Make sure the bench cannot slide and pad the bar; stop lifting once your hips are level with your shoulders and knees.',
    array['glute-bridge', 'romanian-deadlift']::text[], 3, '8-12', 90,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 460),
  ('glute-bridge', 'جسر الأرداف (Glute Bridge)', 'Glute Bridge', 'hips', array['abs']::text[],
    'فرشة تمارين', 'Exercise mat', 'beginner', array['home']::text[],
    array[
      'انسدح على ظهرك وركبتاك مثنيتان وقدماك على الأرض بعرض الورك.',
      'شدّ بطنك حتى يقترب أسفل ظهرك من الأرض.',
      'ادفع بكعبيك وارفع وركك باعتصار عضلات المؤخرة.',
      'توقف لحظة في الأعلى، ثم انزل ببطء.'
    ]::text[],
    array[
      'Lie on your back with knees bent and feet flat, hip-width apart.',
      'Tighten your midsection so your lower back settles toward the floor.',
      'Press through your heels and lift your hips by squeezing your glutes.',
      'Pause at the top, then lower slowly.'
    ]::text[],
    array[
      'خط مستقيم من الكتف للركبة.',
      'الركبتان بعرض الورك.',
      'ازفر مع الرفع.'
    ]::text[],
    array[
      'Straight line from shoulders to knees.',
      'Knees stay hip-width apart.',
      'Breathe out as you lift.'
    ]::text[],
    array[
      'الرفع العالي وتقويس أسفل الظهر.',
      'فتح الركبتين أو ضمّهما.',
      'الدفع بأصابع القدم.'
    ]::text[],
    array[
      'Lifting too high and arching the lower back.',
      'Knees falling out or in.',
      'Pushing through the toes.'
    ]::text[],
    'لا ترفع وركك أعلى من مستوى الخط المستقيم؛ الرفع الزايد يقوّس أسفل الظهر.',
    'Do not lift your hips past a straight line; going higher arches the lower back.',
    array['barbell-hip-thrust', 'bodyweight-squat']::text[], 3, '12-15', 45,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library: Glute Bridge", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/49/glute-bridge/"}]'::jsonb,
    'unreviewed', 470),
  ('lunge', 'لانج - الطعن (Lunge)', 'Lunge', 'hips', array['calf', 'abs']::text[],
    'وزن الجسم أو دمبلين', 'Bodyweight or two dumbbells', 'intermediate', array['home', 'gym']::text[],
    array[
      'قف مستقيم والقدمان بعرض الورك، ويداك على خصرك أو ماسك الدمبلين بجانبك.',
      'خذ خطوة واسعة للأمام برجل وحدة.',
      'انزل بثني الركبتين حتى تقترب الركبة الخلفية من الأرض وجذعك مستقيم.',
      'ادفع بالقدم الأمامية وارجع لوضع الوقوف.',
      'كرّر بالرجل الثانية؛ العدّات المذكورة لكل رجل.'
    ]::text[],
    array[
      'Stand tall with feet hip-width apart, hands on hips or dumbbells at your sides.',
      'Take a long step forward with one leg.',
      'Bend both knees and lower until your back knee is near the floor, torso upright.',
      'Push through the front foot to return to standing.',
      'Repeat on the other leg; the listed reps are per leg.'
    ]::text[],
    array[
      'الركبة الأمامية باتجاه أصابع القدم.',
      'الكعب الأمامي ثابت على الأرض.',
      'صدرك مرفوع.'
    ]::text[],
    array[
      'Front knee tracks in line with the toes.',
      'Front heel stays down.',
      'Chest up.'
    ]::text[],
    array[
      'دخول الركبة الأمامية للداخل.',
      'خطوة قصيرة ترفع الكعب الأمامي.',
      'ضرب الركبة الخلفية بالأرض.',
      'الميلان بالجذع للأمام.'
    ]::text[],
    array[
      'Front knee caving inward.',
      'A short step that lifts the front heel.',
      'Banging the back knee on the floor.',
      'Leaning the torso forward.'
    ]::text[],
    'إذا كان التوازن صعب أو ضايقتك الركبة، جرّب الخطوة للخلف أو تمسّك بسطح ثابت، وانزل لمدى مريح فقط.',
    'If balance is difficult or your knee is uncomfortable, try stepping backward instead or hold a stable support, and lower only through a comfortable range.',
    array['bodyweight-squat', 'goblet-squat', 'glute-bridge']::text[], 3, '8-12', 75,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 480),
  -- ===== calf =====
  ('standing-calf-raise', 'رفع السمانة واقف (Calf Raise)', 'Standing Calf Raise', 'calf', '{}'::text[],
    'وزن الجسم ودرجة أو عتبة (اختياري)', 'Bodyweight and a step (optional)', 'beginner', array['home', 'gym']::text[],
    array[
      'قف والقدمان بعرض الورك وتمسّك بجدار أو كرسي للتوازن.',
      'ارفع كعبيك عن الأرض لأعلى ما تقدر.',
      'توقف ثانية في الأعلى.',
      'نزّل كعبيك ببطء.'
    ]::text[],
    array[
      'Stand with feet hip-width apart, holding a wall or chair for balance.',
      'Rise onto the balls of your feet as high as you can.',
      'Pause for a second at the top.',
      'Lower your heels slowly.'
    ]::text[],
    array[
      'الوزن على مقدمة القدم عند الإصبع الكبير.',
      'الركبتان مستقيمتان بدون قفل قوي.',
      'صعود ونزول بتحكم.'
    ]::text[],
    array[
      'Weight over the ball of the foot near the big toe.',
      'Knees straight but not locked hard.',
      'Controlled up and down.'
    ]::text[],
    array[
      'الارتداد السريع بدون توقف.',
      'ميلان الكاحل للخارج.',
      'مدى حركة قصير.'
    ]::text[],
    array[
      'Bouncing quickly with no pause.',
      'Ankles rolling outward.',
      'Short range of motion.'
    ]::text[],
    'تمسّك بسطح ثابت، وإذا تسوّيه على درجة تأكد إن مقدمة القدم ثابتة زين وانزل ببطء.',
    'Hold something stable, and if you use a step make sure the balls of your feet are secure and lower slowly.',
    array['single-leg-calf-raise', 'machine-calf-raise']::text[], 3, '12-20', 45,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 490),
  ('machine-calf-raise', 'جهاز السمانة واقف', 'Standing Machine Calf Raise', 'calf', '{}'::text[],
    'جهاز السمانة واقف', 'Standing calf raise machine', 'beginner', array['gym']::text[],
    array[
      'اضبط مسند الكتفين على طولك، وقف ومقدمة قدميك على حافة المنصة.',
      'افرد ركبتيك وارفع الوزن وظهرك مستقيم.',
      'نزّل كعبيك ببطء حتى تحسّ بتمدد في السمانة.',
      'ارفع كعبيك لأعلى ما تقدر وتوقف لحظة.'
    ]::text[],
    array[
      'Adjust the shoulder pads to your height and stand with the balls of your feet on the edge of the platform.',
      'Straighten your knees to take the weight, keeping your back straight.',
      'Lower your heels slowly until you feel a stretch in the calves.',
      'Rise as high as you can and pause briefly.'
    ]::text[],
    array[
      'مدى حركة كامل.',
      'توقف ثانية في الأعلى والأسفل.',
      'الجسم مستقيم.'
    ]::text[],
    array[
      'Full range of motion.',
      'Pause one second at top and bottom.',
      'Body stays straight.'
    ]::text[],
    array[
      'ثني الركبتين لدفع الوزن.',
      'الارتداد في الأسفل.',
      'وزن ثقيل يقصّر المدى.'
    ]::text[],
    array[
      'Bending the knees to push the weight.',
      'Bouncing at the bottom.',
      'A load so heavy it shortens the range.'
    ]::text[],
    'حط مقدمة القدم كاملة على المنصة حتى ما تزلق، ولا تنزل بالكعب بقوة أو بسرعة.',
    'Place the whole ball of each foot on the platform so it cannot slip, and do not drop into the bottom position.',
    array['standing-calf-raise', 'leg-press-calf-raise']::text[], 3, '10-15', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 500),
  ('seated-calf-raise', 'جهاز السمانة جالس', 'Seated Calf Raise', 'calf', '{}'::text[],
    'جهاز السمانة جالس (أو دمبل على الركبتين وأنت جالس)', 'Seated calf raise machine (or a dumbbell on your knees while seated)', 'beginner', array['gym', 'home']::text[],
    array[
      'اجلس وحط مقدمة قدميك على المنصة والوسادة فوق أسفل الفخذين.',
      'ارفع كعبيك وفكّ قفل الأمان.',
      'نزّل كعبيك ببطء لتمدد مريح.',
      'ارفع كعبيك لأعلى ما تقدر وتوقف لحظة.'
    ]::text[],
    array[
      'Sit with the balls of your feet on the platform and the pad over your lower thighs.',
      'Lift your heels and release the safety catch.',
      'Lower your heels slowly to a comfortable stretch.',
      'Rise as high as you can and pause briefly.'
    ]::text[],
    array[
      'حركة بطيئة.',
      'اضغط بمقدمة القدم كلها.',
      'جذعك مستقيم.'
    ]::text[],
    array[
      'Move slowly.',
      'Press through the whole ball of the foot.',
      'Sit tall.'
    ]::text[],
    array[
      'الارتداد السريع.',
      'مدى قصير.',
      'سحب الجهاز باليدين للمساعدة.'
    ]::text[],
    array[
      'Bouncing.',
      'Short range.',
      'Pulling on the machine with the hands to help.'
    ]::text[],
    'رجّع قفل الأمان قبل ما تشيل رجليك، وزد الوزن بالتدريج.',
    'Re-engage the safety catch before removing your legs, and add weight gradually.',
    array['standing-calf-raise', 'single-leg-calf-raise']::text[], 3, '12-15', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 510),
  ('single-leg-calf-raise', 'رفع السمانة برجل واحدة', 'Single-Leg Calf Raise', 'calf', '{}'::text[],
    'وزن الجسم ودرجة (ودمبل اختياري)', 'Bodyweight and a step (dumbbell optional)', 'intermediate', array['home', 'gym']::text[],
    array[
      'قف على رجل وحدة ومقدمة القدم على حافة الدرجة، وتمسّك بجدار أو درابزين.',
      'ارفع الرجل الثانية عن الأرض.',
      'ارفع كعبك لأعلى ما تقدر.',
      'نزّل ببطء تحت مستوى الدرجة شوي، وكمّل العدّات ثم بدّل الرجل.'
    ]::text[],
    array[
      'Stand on one leg with the ball of the foot on the edge of a step, holding a wall or rail.',
      'Lift the other foot off the floor.',
      'Rise as high as you can.',
      'Lower slowly to just below step level, finish your reps, then switch legs.'
    ]::text[],
    array[
      'الكاحل مستقيم بدون ميلان.',
      'النزول في ثانيتين أو ثلاث.',
      'استخدم يدك للتوازن فقط.'
    ]::text[],
    array[
      'Ankle stays straight, no rolling.',
      'Take two to three seconds to lower.',
      'Use your hand for balance only.'
    ]::text[],
    array[
      'سحب الجسم باليد.',
      'ثني الركبة للمساعدة.',
      'حركة سريعة.'
    ]::text[],
    array[
      'Pulling yourself up with the hand.',
      'Bending the knee to help.',
      'Rushing.'
    ]::text[],
    'تمسّك دايماً بسطح ثابت، ووقّف إذا حسّيت بألم حاد في وتر الكعب أو السمانة.',
    'Always hold a stable support, and stop if you feel sharp pain in the Achilles tendon or calf.',
    array['standing-calf-raise', 'machine-calf-raise']::text[], 3, '8-12', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 520),
  ('leg-press-calf-raise', 'سمانة على جهاز دفع الرجلين (Leg Press)', 'Leg Press Calf Raise', 'calf', '{}'::text[],
    'جهاز دفع الرجلين (Leg Press)', 'Leg press machine', 'intermediate', array['gym']::text[],
    array[
      'اجلس في الجهاز وادفع المنصة حتى تمتد رجلاك مع ثني بسيط جداً في الركبتين.',
      'خل قفل الأمان مفعّل، وحرّك قدميك حتى تصير مقدمة القدم على أسفل حافة المنصة.',
      'ادفع المنصة بمقدمة قدميك بمدّ الكاحل.',
      'ارجع ببطء حتى تحسّ بتمدد في السمانة.'
    ]::text[],
    array[
      'Sit in the machine and press the platform until your legs are straight with a very slight knee bend.',
      'Leave the safety stops engaged and slide your feet so the balls of your feet are on the lower edge of the platform.',
      'Push the platform away by pointing your feet.',
      'Return slowly until you feel a stretch in the calves.'
    ]::text[],
    array[
      'الركبتان ثابتتان.',
      'الحركة من الكاحل فقط.',
      'مدى كامل وبطيء.'
    ]::text[],
    array[
      'Knees stay still.',
      'Movement only at the ankle.',
      'Full, slow range.'
    ]::text[],
    array[
      'قفل الركبتين بقوة.',
      'وضع أطراف الأصابع فقط على المنصة.',
      'الارتداد.'
    ]::text[],
    array[
      'Locking the knees hard.',
      'Placing only the toes on the platform.',
      'Bouncing.'
    ]::text[],
    'لا تفكّ قفل الأمان في هذا التمرين إذا يسمح الجهاز، وتأكد إن مقدمة القدم كلها على المنصة حتى ما تزلق.',
    'Keep the safety stops engaged for this exercise where the machine allows, and make sure the whole ball of the foot is on the platform so it cannot slip.',
    array['machine-calf-raise', 'standing-calf-raise']::text[], 3, '10-15', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 530),
  ('jump-rope', 'نط الحبل', 'Jump Rope', 'calf', array['shoulders', 'forearms']::text[],
    'حبل نط', 'Jump rope', 'intermediate', array['home', 'gym']::text[],
    array[
      'امسك طرفي الحبل والكوعان قريبان من جسمك والحبل خلف كعبيك.',
      'دوّر الحبل بمعصميك ونط نطات صغيرة على مقدمة القدمين.',
      'انزل بنعومة مع ثني بسيط في الركبتين.',
      'كمّل بإيقاع ثابت للوقت المحدد.'
    ]::text[],
    array[
      'Hold the handles with elbows close to your body and the rope behind your heels.',
      'Turn the rope with your wrists and make small hops on the balls of your feet.',
      'Land softly with a slight bend in your knees.',
      'Keep a steady rhythm for the set time.'
    ]::text[],
    array[
      'نطة منخفضة تكفي لمرور الحبل.',
      'الدوران من المعصم مو من الكتف.',
      'جسمك مستقيم وعينك للأمام.'
    ]::text[],
    array[
      'Jump just high enough to clear the rope.',
      'Turn from the wrists, not the shoulders.',
      'Stay tall, eyes forward.'
    ]::text[],
    array[
      'النط العالي.',
      'النزول على الكعب أو على القدم كاملة بقوة.',
      'فتح الذراعين بعيد عن الجسم.'
    ]::text[],
    array[
      'Jumping too high.',
      'Landing on the heels or flat-footed and hard.',
      'Arms drifting wide.'
    ]::text[],
    'انط على أرض مستوية تمتص الصدمة وبحذاء رياضي، وابدأ بفترات قصيرة. اختر تمرين رفع السمانة إذا عندك ألم في الركبة أو الكاحل أو ما تناسبك تمارين القفز.',
    'Jump on a flat, shock-absorbing surface in training shoes and start with short bouts. Choose calf raises instead if you have knee or ankle pain or if jumping is not suitable for you.',
    array['standing-calf-raise', 'single-leg-calf-raise']::text[], 4, '30-60s', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 540),
  -- ===== abs =====
  ('plank', 'بلانك (Plank)', 'Plank', 'abs', array['shoulders', 'back']::text[],
    'فرشة تمارين', 'Exercise mat', 'beginner', array['home', 'gym']::text[],
    array[
      'انسدح على بطنك وحط ساعديك على الأرض والكوعان تحت الكتفين.',
      'مدّ رجليك للخلف على أطراف الأصابع.',
      'شدّ بطنك ومؤخرتك وارفع جسمك حتى يصير خط مستقيم من الرأس للكعب.',
      'ثبّت للوقت المحدد وأنت تتنفس بشكل طبيعي، ثم انزل بهدوء.'
    ]::text[],
    array[
      'Lie face down with your forearms on the floor and elbows under your shoulders.',
      'Extend your legs back onto your toes.',
      'Tighten your midsection and glutes and lift your body into a straight line from head to heels.',
      'Hold for the set time while breathing normally, then lower gently.'
    ]::text[],
    array[
      'الكتفان فوق الكوعين.',
      'عينك على الأرض والرقبة مرتاحة.',
      'اعصر المؤخرة واسحب السرّة للداخل.'
    ]::text[],
    array[
      'Shoulders over elbows.',
      'Eyes on the floor, neck relaxed.',
      'Squeeze your glutes and draw your navel in.'
    ]::text[],
    array[
      'هبوط الخصر وتقويس أسفل الظهر.',
      'رفع المؤخرة للأعلى.',
      'حبس النفس.'
    ]::text[],
    array[
      'Hips sagging and lower back arching.',
      'Hips piked up high.',
      'Holding your breath.'
    ]::text[],
    'وقّف التمرين أول ما يبدأ خصرك يهبط؛ ثبات قصير بوضع صحيح أفضل من ثبات طويل غلط. وقّف إذا حسّيت بألم في أسفل الظهر.',
    'End the hold as soon as your hips start to sag; a short hold with good form beats a long one without it. Stop if you feel lower-back pain.',
    array['dead-bug', 'bird-dog', 'side-plank']::text[], 3, '20-40s', 45,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library: Front Plank", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/32/front-plank/"}]'::jsonb,
    'unreviewed', 550),
  ('dead-bug', 'ديد بغ (Dead Bug)', 'Dead Bug', 'abs', array['hips']::text[],
    'فرشة تمارين', 'Exercise mat', 'beginner', array['home']::text[],
    array[
      'انسدح على ظهرك وارفع ذراعيك باتجاه السقف، وارفع ركبتيك فوق الورك بزاوية 90 درجة.',
      'شدّ بطنك حتى يلامس أسفل ظهرك الأرض بلطف.',
      'مدّ ذراع ورجل متعاكستين ببطء باتجاه الأرض بدون ما تلمسها.',
      'ارجع للبداية وبدّل الجهة؛ العدّات لكل جهة.'
    ]::text[],
    array[
      'Lie on your back with arms pointing to the ceiling and knees bent 90 degrees above your hips.',
      'Tighten your midsection so your lower back rests gently on the floor.',
      'Slowly extend one arm and the opposite leg toward the floor without touching it.',
      'Return to the start and switch sides; reps are per side.'
    ]::text[],
    array[
      'أسفل الظهر ثابت على الأرض.',
      'حركة بطيئة مع زفير.',
      'مدّ لحد ما تقدر تتحكم فقط.'
    ]::text[],
    array[
      'Lower back stays on the floor.',
      'Move slowly and breathe out.',
      'Reach only as far as you can control.'
    ]::text[],
    array[
      'ارتفاع أسفل الظهر عن الأرض.',
      'حركة سريعة.',
      'حبس النفس.'
    ]::text[],
    array[
      'Lower back lifting off the floor.',
      'Moving fast.',
      'Holding your breath.'
    ]::text[],
    'إذا ارتفع أسفل ظهرك عن الأرض، قصّر مدى الحركة أو حرّك الرجلين فقط.',
    'If your lower back lifts off the floor, shorten the range or move only the legs.',
    array['bird-dog', 'plank']::text[], 3, '8-10', 45,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 560),
  ('bird-dog', 'بيرد دوغ (Bird Dog)', 'Bird Dog', 'abs', array['back', 'hips']::text[],
    'فرشة تمارين', 'Exercise mat', 'beginner', array['home']::text[],
    array[
      'انزل على يديك وركبتيك؛ الكفّان تحت الكتفين والركبتان تحت الورك.',
      'شدّ بطنك وخل ظهرك مستوٍ.',
      'مدّ ذراع للأمام والرجل المعاكسة للخلف ببطء حتى يصيران بمستوى الجسم.',
      'ثبّت ثانية أو ثانيتين، ارجع، وبدّل الجهة؛ العدّات لكل جهة.'
    ]::text[],
    array[
      'Get on hands and knees, hands under shoulders and knees under hips.',
      'Brace your midsection and keep your back flat.',
      'Slowly reach one arm forward and the opposite leg back until they are level with your body.',
      'Hold one or two seconds, return, and switch sides; reps are per side.'
    ]::text[],
    array[
      'الورك والكتفان بنفس المستوى.',
      'تخيّل كوب ماي على أسفل ظهرك.',
      'الرأس على امتداد الظهر.'
    ]::text[],
    array[
      'Hips and shoulders stay level.',
      'Imagine a glass of water on your lower back.',
      'Head in line with your spine.'
    ]::text[],
    array[
      'رفع الرجل عالي وتقويس أسفل الظهر.',
      'لفّ الورك للجانب.',
      'حركة سريعة.'
    ]::text[],
    array[
      'Lifting the leg too high and arching the lower back.',
      'Rotating the hips.',
      'Rushing.'
    ]::text[],
    'ارفع الذراع والرجل لحد ما تقدر تثبّت أسفل ظهرك فقط، واستخدم فرشة تحت الركبتين.',
    'Raise the arm and leg only as high as you can keep your lower back still, and pad your knees.',
    array['dead-bug', 'plank']::text[], 3, '8-10', 45,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library: Bird-dog", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/14/bird-dog/"}]'::jsonb,
    'unreviewed', 570),
  ('crunch', 'تمرين المعدة (Crunch)', 'Crunch', 'abs', '{}'::text[],
    'فرشة تمارين', 'Exercise mat', 'beginner', array['home', 'gym']::text[],
    array[
      'انسدح على ظهرك وركبتاك مثنيتان وقدماك على الأرض.',
      'حط أطراف أصابعك خلف أذنيك أو يديك على صدرك.',
      'شدّ بطنك وارفع رأسك وكتفيك عن الأرض بتقريب الأضلاع من الحوض.',
      'توقف لحظة، ثم انزل ببطء.'
    ]::text[],
    array[
      'Lie on your back with knees bent and feet flat.',
      'Place your fingertips behind your ears or your hands across your chest.',
      'Tighten your abs and lift your head and shoulders by drawing your ribs toward your pelvis.',
      'Pause, then lower slowly.'
    ]::text[],
    array[
      'أسفل الظهر على الأرض.',
      'مسافة بين الذقن والصدر.',
      'ازفر مع الرفع.'
    ]::text[],
    array[
      'Lower back stays on the floor.',
      'Keep space between chin and chest.',
      'Breathe out as you lift.'
    ]::text[],
    array[
      'سحب الرقبة باليدين.',
      'الرفع بالزخم.',
      'الجلوس الكامل بدل رفع الكتفين فقط.'
    ]::text[],
    array[
      'Pulling on the neck with the hands.',
      'Using momentum.',
      'Sitting all the way up instead of lifting just the shoulders.'
    ]::text[],
    'لا تسحب رأسك بيديك. إذا عندك ألم في الرقبة أو أسفل الظهر، اختر تمرين ديد بغ (Dead Bug) أو البلانك.',
    'Do not pull on your head. If you have neck or lower-back pain, choose the dead bug or plank instead.',
    array['dead-bug', 'cable-crunch', 'plank']::text[], 3, '12-15', 45,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 580),
  ('side-plank', 'بلانك جانبي (Side Plank)', 'Side Plank', 'abs', array['shoulders', 'hips']::text[],
    'فرشة تمارين', 'Exercise mat', 'intermediate', array['home', 'gym']::text[],
    array[
      'انسدح على جنبك والكوع تحت الكتف والرجلان فوق بعض.',
      'شدّ بطنك وارفع وركك حتى يصير جسمك خط مستقيم.',
      'ثبّت للوقت المحدد وأنت تتنفس.',
      'انزل ببطء وبدّل الجهة؛ الوقت لكل جهة.'
    ]::text[],
    array[
      'Lie on your side with your elbow under your shoulder and legs stacked.',
      'Brace and lift your hips until your body forms a straight line.',
      'Hold for the set time while breathing.',
      'Lower slowly and switch sides; the time is per side.'
    ]::text[],
    array[
      'الورك للأمام ومرفوع.',
      'الكتف بعيد عن الأذن.',
      'الجسم بخط واحد من الرأس للقدم.'
    ]::text[],
    array[
      'Hips forward and lifted.',
      'Shoulder away from your ear.',
      'One line from head to feet.'
    ]::text[],
    array[
      'هبوط الورك.',
      'دوران الجسم للأمام.',
      'الكوع بعيد عن تحت الكتف.'
    ]::text[],
    array[
      'Hips dropping.',
      'Rolling the body forward.',
      'Elbow not under the shoulder.'
    ]::text[],
    'إذا حسّيت بضغط على الكتف، اثنِ ركبتيك وثبّت على الركبة السفلية، ووقّف عند أي ألم.',
    'If your shoulder feels strained, bend your knees and support yourself on the lower knee, and stop if there is any pain.',
    array['plank', 'bird-dog']::text[], 3, '15-30s', 45,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 590),
  ('hanging-knee-raise', 'رفع الركبتين معلّق (Hanging Knee Raise)', 'Hanging Knee Raise', 'abs', array['forearms', 'hips']::text[],
    'بار عقلة', 'Pull-up bar', 'advanced', array['gym']::text[],
    array[
      'تعلّق على البار بقبضة بعرض الكتفين وذراعاك ممدودتان.',
      'شدّ كتفيك للأسفل وبطنك للداخل.',
      'ارفع ركبتيك باتجاه صدرك بلفّ الحوض للأعلى.',
      'نزّل رجليك ببطء بدون تأرجح.'
    ]::text[],
    array[
      'Hang from the bar with a shoulder-width grip and straight arms.',
      'Draw your shoulders down and tighten your abs.',
      'Raise your knees toward your chest, curling your pelvis up.',
      'Lower your legs slowly without swinging.'
    ]::text[],
    array[
      'ابدأ الحركة من البطن مو من الرجلين.',
      'توقف لحظة في الأعلى.',
      'نزول متحكم فيه.'
    ]::text[],
    array[
      'Start the move from your abs, not your legs.',
      'Pause at the top.',
      'Controlled lowering.'
    ]::text[],
    array[
      'التأرجح واستخدام الزخم.',
      'رفع الركبتين بدون لفّ الحوض.',
      'ترك الكتفين مرتخيين.'
    ]::text[],
    array[
      'Swinging and using momentum.',
      'Lifting the knees without curling the pelvis.',
      'Hanging with loose shoulders.'
    ]::text[],
    'تأكد من ثبات البار وقوة قبضتك، وانزل بتحكم قبل ما تفلت يدك. تجنّبه مع إصابات الكتف.',
    'Check the bar is secure and your grip is strong, and step down under control before your grip fails. Avoid it with shoulder injuries.',
    array['dead-bug', 'crunch', 'cable-crunch']::text[], 3, '8-12', 75,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 600),
  ('cable-crunch', 'معدة بالكيبل (Cable Crunch)', 'Kneeling Cable Crunch', 'abs', '{}'::text[],
    'كيبل علوي مع حبل', 'High cable with rope attachment', 'intermediate', array['gym']::text[],
    array[
      'انزل على ركبتيك قدّام الكيبل وامسك الحبل بجانبي رأسك.',
      'ثبّت وركك في مكانه.',
      'اثنِ جذعك للأسفل بتقريب الأضلاع من الحوض.',
      'ارجع ببطء لوضع البداية.'
    ]::text[],
    array[
      'Kneel facing the cable and hold the rope at the sides of your head.',
      'Keep your hips in place.',
      'Curl your torso down, bringing your ribs toward your pelvis.',
      'Return slowly to the start.'
    ]::text[],
    array[
      'الحركة من البطن واليدان ثابتتان.',
      'ازفر مع النزول.',
      'الورك ما يرجع للخلف.'
    ]::text[],
    array[
      'Abs do the work; hands stay fixed.',
      'Breathe out as you curl down.',
      'Hips do not sit back.'
    ]::text[],
    array[
      'سحب الحبل بالذراعين.',
      'الجلوس للخلف على الكعبين.',
      'وزن ثقيل وحركة قصيرة.'
    ]::text[],
    array[
      'Pulling the rope with the arms.',
      'Sitting back onto the heels.',
      'Heavy load with a tiny range.'
    ]::text[],
    'استخدم فرشة تحت ركبتيك ووزن متوسط، ولا تسحب الحبل على رقبتك.',
    'Pad your knees, use a moderate load, and do not pull the rope against your neck.',
    array['crunch', 'dead-bug']::text[], 3, '10-15', 60,
    '[{"org": "NSCA", "title": "Essentials of Strength Training and Conditioning (4th ed.)", "year": 2016}, {"org": "ACSM", "title": "Progression Models in Resistance Training for Healthy Adults (position stand)", "year": 2009}, {"org": "ACE", "title": "ACE Exercise Library", "year": 2026, "url": "https://www.acefitness.org/resources/everyone/exercise-library/"}]'::jsonb,
    'unreviewed', 610)
on conflict (id) do update set
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  primary_muscle = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles,
  equipment_ar = excluded.equipment_ar,
  equipment_en = excluded.equipment_en,
  difficulty = excluded.difficulty,
  environments = excluded.environments,
  instructions_ar = excluded.instructions_ar,
  instructions_en = excluded.instructions_en,
  cues_ar = excluded.cues_ar,
  cues_en = excluded.cues_en,
  mistakes_ar = excluded.mistakes_ar,
  mistakes_en = excluded.mistakes_en,
  safety_ar = excluded.safety_ar,
  safety_en = excluded.safety_en,
  alternatives = excluded.alternatives,
  default_sets = excluded.default_sets,
  default_reps = excluded.default_reps,
  rest_seconds = excluded.rest_seconds,
  sources = excluded.sources,
  review_status = excluded.review_status,
  sort_order = excluded.sort_order;

commit;
