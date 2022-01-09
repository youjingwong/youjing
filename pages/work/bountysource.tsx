import Image from "next/image";
import React from "react";
import home from "../../public/work/bountysource/home.png";
import salt from "../../public/work/bountysource/salt.png";
import BackToHomeLink from "../../src/data/components/BackToHomeLink";

interface StoneAndChalkProps {}

const Bountysource = ({}: StoneAndChalkProps): JSX.Element => {
  return (
    <div className="container py-20">
      <h1>Bountysource</h1>
      <div className="text-gray-400">Ruby on Rails · Angular JS</div>
      <a
        className="underline text-sm mr-3"
        href="https://app.bountysource.com/"
        target="_blank"
        rel="noreferrer"
      >
        Site Link
      </a>

      <BackToHomeLink />

      <div className="pt-3"></div>
      <ul className="list-disc pl-5">
        <li className="mt-3">
          Led the BountySource development team delivering solutions that
          include design, implementing and supporting BountySource functions for
          crypto bounties, reskin, and integration with web3.js and MetaMask.
        </li>
      </ul>

      <div className="mt-8">
        <div className="mt-3">
          <Image
            src={home}
            alt="home"
            placeholder="blur"
            sizes="(min-width: 1024px) 1024px, 100vw"
            layout="responsive"
          />
        </div>
        <div className="mt-3">
          <Image
            src={salt}
            alt="salt"
            placeholder="blur"
            sizes="(min-width: 1024px) 1024px, 100vw"
            layout="responsive"
          />
        </div>
      </div>
    </div>
  );
};
export default Bountysource;
