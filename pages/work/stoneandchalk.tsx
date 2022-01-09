import Image from "next/image";
import React from "react";
import eventCalendar from "../../public/work/stoneandchalk/custom_event_calendar.png";
import customSidebar from "../../public/work/stoneandchalk/custom_sidebar.png";
import landingPage from "../../public/work/stoneandchalk/home_page.png";
import BackToHomeLink from "../../src/data/components/BackToHomeLink";

interface StoneAndChalkProps {}

const StoneAndChalk = ({}: StoneAndChalkProps): JSX.Element => {
  return (
    <div className="container py-20">
      <h1>Stone & Chalk</h1>
      <div className="text-gray-400">
        Next.js · Boostrap · Ruby on Rails · Prismic
      </div>
      <a
        className="underline text-sm"
        href="https://www.stoneandchalk.com.au"
        target="_blank"
        rel="noreferrer"
      >
        Site Link
      </a>

      <BackToHomeLink />

      <div className="pt-3"></div>
      <ul className="list-disc pl-5">
        <li className="mt-3">Implemented custom UI/UX design</li>
        <li>Integration with Prismic CMS, Hubspot and Analytics</li>
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
          <Image
            src={customSidebar}
            alt="custom-sidebar"
            placeholder="blur"
            sizes="(min-width: 1024px) 1024px, 100vw"
            layout="responsive"
          />
        </div>
        <div className="mt-3">
          <h6>Custom calendar UI</h6>
          <Image
            src={eventCalendar}
            alt="event-calendar"
            placeholder="blur"
            sizes="(min-width: 1024px) 1024px, 100vw"
            layout="responsive"
          />
        </div>
      </div>
    </div>
  );
};
export default StoneAndChalk;
