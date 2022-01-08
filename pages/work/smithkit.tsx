import Image from "next/image";
import React from "react";
import landingPage from "../../public/work/smithkit/landing_page.png";
import mealPlanning from "../../public/work/smithkit/meal_planning.png";
import nutritionalSummary from "../../public/work/smithkit/nutritional_summary.png";
import recipeManagement from "../../public/work/smithkit/recipe_management.png";

interface SmithKitProps {}

const SmithKit = ({}: SmithKitProps): JSX.Element => {
  return (
    <div className="container py-20">
      <h1>Smithkit</h1>
      <div className="text-gray-400">
        Ruby on Rails · React · Next.js · Chargebee
      </div>
      <a
        className="underline text-sm"
        href="https://www.smithkit.com.au"
        target="_blank"
        rel="noreferrer"
      >
        Site Link
      </a>

      <div className="pt-3"></div>
      <ul className="list-disc pl-5">
        <li className="mt-3">Solo developer</li>
        <li>Full fledge SAAS - Integration with Chargebee</li>
        <li>Menu drag and drop management</li>
      </ul>

      <div className="mt-8">
        <div className="mt-3">
          <h6>Landing Page</h6>
          <Image
            src={landingPage}
            alt="landing-page"
            placeholder="blur"
            sizes="(min-width: 1024px) 1024px, 100vw"
            layout="responsive"
          />
        </div>
        <div className="mt-3">
          <h6>Meal Planning</h6>
          <Image
            src={mealPlanning}
            alt="meal-planning"
            placeholder="blur"
            sizes="(min-width: 1024px) 1024px, 100vw"
            layout="responsive"
          />
        </div>

        <div className="mt-3">
          <h6>Recipe Management</h6>
          <Image
            src={recipeManagement}
            alt="recipe-management"
            placeholder="blur"
            sizes="(min-width: 1024px) 1024px, 100vw"
            layout="responsive"
          />
        </div>

        <div className="mt-3">
          <h6>Nutrition Report</h6>
          <Image
            src={nutritionalSummary}
            alt="nutritional-summary"
            placeholder="blur"
            sizes="(min-width: 1024px) 1024px, 100vw"
            layout="responsive"
          />
        </div>
      </div>
    </div>
  );
};
export default SmithKit;
