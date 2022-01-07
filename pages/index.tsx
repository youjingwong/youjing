import type { NextPage } from "next";

const Home: NextPage = () => {
  return (
    <div className="container py-20">
      <h1 className="text-2xl font-bold">You Jing</h1>

      <p className="mt-5">
        I&apos;m a full stack developer in Malaysia and building systems and
        platforms. Previously mentored hundreds of bootcamp students, and also
        contracted for startups and enterprises, small and large.
      </p>
      <p>
        Started off scripting games with{" "}
        <a
          href="https://www.autoitscript.com/site/"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          AutoIt
        </a>{" "}
        in 2012. Learned coding via MOOC courses, a Ruby on Rails bootcamp in
        Malaysia, and an iOS bootcamp in San Francisco. Always curious and
        flexible, I have worked on a variety of domains, including but not
        limited to two sided platforms, meal planning, warehouse management
        systems, and call center systems.
      </p>
      <hr className="my-5"></hr>
      <h2 className="text-xl mt-4 font-semibold">Previous/Ongoing Work</h2>

      <div>
        <p></p>
      </div>
    </div>
  );
};

export default Home;
