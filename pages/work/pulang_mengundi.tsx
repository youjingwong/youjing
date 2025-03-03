import Image from "next/image";
import React from "react";
import main from "../../public/work/pulang_mengundi/main.png";
import subsidy from "../../public/work/pulang_mengundi/subsidy.jpeg";
import BackToHomeLink from "../../src/data/components/BackToHomeLink";

interface StoneAndChalkProps { }

const PulangMengundi = ({ }: StoneAndChalkProps): React.JSX.Element => {
  return (
    <div className="container py-20">
      <h1>Pulang Mengundi</h1>
      <div className="text-gray-400">Ruby on Rails · Open Source</div>
      <a
        className="underline text-sm mr-3"
        href="https://www.pulangmengundi.com"
        target="_blank"
        rel="noreferrer"
      >
        Site Link
      </a>
      <a
        className="underline text-sm"
        href="https://github.com/pulang-mengundi/pulang_mengundi"
        target="_blank"
        rel="noreferrer"
      >
        Github Link
      </a>

      <BackToHomeLink />

      <div className="pt-3"></div>
      <ul className="list-disc pl-5">
        <li className="mt-3">
          PulangMengundi.com was launched as part of the #pulangmengundi
          movement on the 13th of April, 2018. ​9th May 2018 marks the
          completion of this initiative.
        </li>
        <li>7,000 carpoolers connected</li>
        <li>RM75,000 pledged by the public</li>
        <li>RM30,000 raised for Persatuan Belia Harmoni Malaysia</li>
        <li>
          Site published on Huffpost, Quarts, SCMP, Channel news asia, and many
          other media.
        </li>
      </ul>

      <div className="mt-8">
        <div className="mt-3">
          <h6>Main</h6>
          <Image
            src={main}
            alt="main"
            placeholder="blur"
            sizes="(min-width: 1024px) 1024px, 100vw"
            layout="responsive"
          />
        </div>
        <div className="mt-3">
          <h6>Subsidy</h6>
          <Image
            src={subsidy}
            alt="subsidy"
            placeholder="blur"
            sizes="(min-width: 1024px) 1024px, 100vw"
            layout="responsive"
          />
        </div>
      </div>
    </div>
  );
};
export default PulangMengundi;
