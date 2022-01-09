import Image from "next/image";
import React from "react";
import maps from "../../public/work/myppehub/maps.png";
import requestScreen from "../../public/work/myppehub/request_screen.png";
import BackToHomeLink from "../../src/data/components/BackToHomeLink";

interface StoneAndChalkProps {}

const MyPpeHub = ({}: StoneAndChalkProps): JSX.Element => {
  return (
    <div className="container py-20">
      <h1>My Ppe Hub</h1>
      <div className="text-gray-400">Ruby on Rails · Next.js</div>
      <a
        className="underline text-sm mr-3"
        href="https://www.facebook.com/myppehub/"
        target="_blank"
        rel="noreferrer"
      >
        Site Link
      </a>

      <BackToHomeLink />

      <div className="pt-3"></div>
      <ul className="list-disc pl-5">
        <li className="mt-3">
          Centralised hub that consolidates PPE requests from the front-liners
          fighting COVID-19 in Malaysia.
        </li>
        <li>Over 169,000 Ppe items pledged and delivered</li>
      </ul>

      <div className="mt-8">
        <div className="mt-3">
          <h6>Main</h6>
          <Image
            src={maps}
            alt="maps"
            placeholder="blur"
            sizes="(min-width: 1024px) 1024px, 100vw"
            layout="responsive"
          />
        </div>
        <div className="mt-3">
          <h6>Subsidy</h6>
          <Image
            src={requestScreen}
            alt="request-screen"
            placeholder="blur"
            sizes="(min-width: 1024px) 1024px, 100vw"
            layout="responsive"
          />
        </div>
      </div>
    </div>
  );
};
export default MyPpeHub;
