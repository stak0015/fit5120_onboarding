Create a responsive web application prototype called “MyHealth Malaysia”.

Purpose:
Help middle-aged Malaysian adults aged 40–60 understand population-level mortality insights and receive practical preventive-health recommendations. This is an educational decision-support prototype, not a medical diagnosis tool.

Design style:
- Clean, trustworthy, modern healthcare interface.
- Use a calm navy, teal, white, and light green colour palette.
- Use accessible contrast, large readable text, rounded cards, simple icons, and clear charts.
- Design for desktop first, with responsive mobile layouts.
- Use plain English and Malaysian context.
- Avoid alarming visuals such as warning reds, death imagery, or fear-based language.

Create the following screens and connect them with prototype interactions.

SCREEN 1: Welcome / Landing Page
- App name: MyHealth Malaysia
- Headline: “Understand your health context. Take proactive steps.”
- Supporting text: “Explore Malaysian mortality statistics based on your demographic profile and receive practical health actions.”
- Primary button: “Create my profile”
- Secondary link: “How it works”
- Three feature cards:
  1. Create your profile
  2. Explore population-level health insights
  3. Receive practical recommendations
- Add a small disclaimer: “This tool provides population-level information and does not diagnose or predict individual health outcomes.”

SCREEN 2: Profile Setup
Create a multi-step form with a progress indicator.

Step 1: Demographic profile
- Age group dropdown:
  40–44, 45–49, 50–54, 55–59, 60–64
- Sex selection:
  Male, Female, Prefer not to say
- Ethnicity selection:
  Malay, Chinese, Indian, Other Bumiputera, Other, Prefer not to say
- State selection:
  Malaysian states and federal territories
- Button: “Continue”

Step 2: Lifestyle information
- Physical activity:
  Rarely, Sometimes, Regularly
- Smoking:
  Current smoker, Former smoker, Non-smoker, Prefer not to say
- Alcohol use:
  None, Occasionally, Frequently, Prefer not to say
- Diet:
  Mostly balanced, Mixed, Often highly processed, Prefer not to say
- Family history:
  No known history, Heart disease, Diabetes, Cancer, Other, Prefer not to say
- Button: “Generate my insights”
- Include a privacy note: “Only the information needed for this prototype is used to generate your results.”

SCREEN 3: Profile Summary / Loading
- Show a short loading state with the message:
  “Matching your profile with Malaysian mortality data…”
- Then display a confirmation card:
  “Your comparison group”
  “Adults aged 45–49 in Selangor”
- Show the selected profile details.
- Button: “View health insights”

SCREEN 4: Health Insights Dashboard
Create the main results page.

Header:
- “Your health insights”
- Profile badge: “Based on your selected comparison group”
- Button: “Edit profile”

Main summary card:
- Title: “Your comparison group”
- Example: “Malaysian adults aged 45–49 in Selangor”
- Description: “These results describe patterns in the selected population group. They are not a prediction of your personal health outcome.”

Top causes section:
- Title: “Selected causes of death”
- Display a horizontal bar chart or five ranked cards:
  1. Ischaemic heart diseases
  2. Pneumonia
  3. Diabetes mellitus
  4. Kidney failure
  5. Transport accidents
- Each item should show:
  - Rank
  - Cause name
  - Death count
  - Percentage where available
- Use realistic placeholder values, clearly labelled as example data.

Annual deaths summary:
- Large statistic card: “Total recorded deaths”
- Example: “1,245”
- Supporting text: “For this selected population category in 2024”
- Include a small information icon explaining that this is a population-level count.

Comparison section:
- Allow the user to switch between:
  - Age group view
  - State view
  - Sex comparison
- Use a simple chart or comparison cards.
- Clearly indicate when a comparison uses a different source category.

Data source panel:
- “Data source: Department of Statistics Malaysia, Statistics on Causes of Death, 2024”
- “Last available dataset year: 2024”
- Link-style button: “View data limitations”

Bottom call-to-action:
- Button: “See my recommended actions”

SCREEN 5: Health Recommendations
- Header: “Practical actions for you”
- Supporting text: “These suggestions are based on the lifestyle information you provided and general preventive-health guidance.”
- Display three prioritised recommendation cards:
  1. Move more regularly
     - Explanation: “Start with short walks or activity breaks during the week.”
     - Button: “Set this as my goal”
  2. Consider smoking-cessation support
     - Explanation: “Reducing or stopping smoking can support long-term health.”
     - Button: “Learn more”
  3. Improve one meal each day
     - Explanation: “Begin with one practical change, such as adding vegetables or reducing highly processed food.”
     - Button: “Set this as my goal”
- Include a disclaimer that recommendations are general and users should consult a healthcare professional for personal advice.

SCREEN 6: Goal Confirmation
- Show the selected goal.
- Example:
  “My goal: Take a 20-minute walk three times this week”
- Fields:
  - Target
  - Timeframe
  - Status: Not started
- Buttons:
  - “Save goal”
  - “Back to recommendations”
- Show a success message after saving:
  “Your goal has been saved.”

SCREEN 7: Data Limitations / About
- Explain:
  - The data represents population-level mortality patterns.
  - It does not predict individual outcomes.
  - It is not a diagnosis.
  - Some profile combinations may use the closest available dataset category.
  - Users should seek professional medical advice for personal concerns.
- Include a simple diagram showing:
  “User profile → Comparison group → Population-level insight → General preventive action”

Prototype interactions:
- Welcome button opens Profile Setup.
- Profile form progresses through the steps.
- Generate button opens the loading state and then the Health Insights Dashboard.
- Edit profile returns to Profile Setup.
- View recommendations opens the Recommendations screen.
- Set goal opens Goal Confirmation.
- Save goal displays the success state.
- Data limitations links open the About screen.

Keep the prototype focused on the core MVP journey:
Profile → Mortality Insights → Recommendations → Optional Goal.

Do not include:
- Medical diagnosis.
- Individual probability of death.
- Complex AI risk scoring.
- Gamification.
- Social or family features.
- Multilingual screens.
- Financial or retirement analysis.
- Detailed symptom checking.