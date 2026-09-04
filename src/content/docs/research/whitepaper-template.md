---
title: White Paper Universal Template
description: A template for writing a scientific research paper.
sidebar:
  label: Whitepaper template
  order: 5
head:
  - tag: style
    content: |
      .sl-markdown-content p,
      .sl-markdown-content li { text-align: justify; }
---

### Uploaded: 10th of August, 2026
### Author: Aleksandr Slokov

This is a general mindset framework for all empirical scientific papers. Instead of starting right away with long paragraphs, use this document as a list of interview questions. If you can answer all these questions, you already have 80% of the paper's content.

## **Title & Info**

* **Title:** What does this research do, what problem does it solve, or what outstanding method does it use? (Keep it concise, include key words for easy searching).
* **Authors:** Who contributed? Affiliations? Who is the Corresponding author?

## **Abstract**

*The most important paragraph (150 - 250 words). Many people only read this part to decide whether to read further. Write this part LAST.*

* **[Context]:** What is the broader problem you are solving? Why is it important?
* **[The Gap]:** What are the fatal limitations/shortcomings of current solutions?
* **[Solution]:** What new method/approach do you propose to fill that gap?
* **[Results]:** What is the most prominent quantitative (numbers) or qualitative evidence proving your solution is effective?
* **[Implications]:** What is the greatest contribution of this research to practice or academia?

## **1. Introduction**

*This section is an information funnel: Going from the big picture narrowing down to your main point.*

* **Opening:** What is this field and why should society/academia care about it?
* **State-of-the-art:** What has been done already?
* **The Problem/Gap:** Despite much work, what is the core barrier that no one has completely solved yet? (Example: Slow, expensive, inaccurate, not applicable to environment X...).
* **The Proposed Approach:** In this paper, how do we solve the above problem?
* **Key Contributions:** Bullet point 3-4 of the biggest contributions of the paper. (E.g., "First, we propose architecture X... Second, we publish dataset Y... Third, we demonstrate a Z% improvement...").

## **2. Related Work / Background**

*This is not listing history, but building an argument: "People have done X, Y, Z, but it is still not enough".*

* **Method Group 1:** State the most related studies, their advantages.
* **Method Group 2 (if any):** State other trending approaches.
* **The Distinction:** Affirm the DIFFERENCE. How does my system/method overcome the weaknesses of the above groups? (Where does your research stand in this picture?).

## **3. Methodology / Proposed Method**

*This is the heart of the paper. Answer the question: What did you DO and HOW did you do it?*

* *Important note:* Always start with a very clear **Flowchart/Architecture Diagram**.
* **3.1. Method Overview:** Looking at the diagram, what does the big picture look like running from A to Z?
* **3.2. Core Components (Innovation Focus):** Delve into the newest thing you created.
  * What is the mathematical/theoretical basis? (Write formulas if any).
  * How does the algorithm work?
* **3.3. Auxiliary Steps/Components:** Other components for the system to run smoothly. Detailed enough so others can reproduce your model.

## **4. Theoretical Analysis / Justification *(Optional but highly recommended)***

*Persuade the reader with scientific reasoning that the choice in Section 3 is correct.*

* Why choose this design and not another design?
* Compare the complexity (time, space), cost, or feasibility of the new method with the old method theoretically (no need to run experiments yet).

## **5. Experimental Setup**

*Maximum transparency so the paper has scientific credibility.*

* **Datasets / Materials:** Where from? What size? What characteristics? How was it pre-processed?
* **Environment / Hardware:** What machine did it run on, what software/chemicals/measuring equipment was used?
* **Evaluation Metrics:** How to know if it is "good"? (Use accuracy, error rate, run time, or what scale?).
* **Baseline:** Which old methods will you pit your method against to prove superiority?

## **6. Results & Discussion**

*Let the numbers and charts speak.*

* **6.1. Main Results:**
  * Provide a **Table** comparing your results with the Baselines.
  * Comment on the table: In which criteria is your method superior? Specific numbers (X times faster, Y% more accurate).
* **6.2. Ablation Studies / Sensitivity Analysis:**
  * *Question:* Are you sure the new component you added (in section 3) actually has an effect?
  * *Method:* Turn off/Remove each part of the system and see if the results get worse. This proves that no part of your design is redundant.
* **6.3. Limitations & Failure Cases:**
  * Be honest: Are there cases where your method works incorrectly/poorly? Why? (This honesty increases your scientific credibility).

## **7. Conclusion**

*Leave a lasting impression on the reader.*

* **Summary:** Reiterate in 1-2 sentences the biggest solution and achievement (like the Abstract but using different words).
* **Implications:** Re-emphasize importance.
* **Future Work:** Based on the limitations (in 6.3), what can you or the community do next in the coming years? (Example: Expand to other problems, optimize energy...).

## **Auxiliary Sections**

* **Acknowledgements:** Who funded the money? Which unit lent the lab/GPU? Who contributed ideas but not enough to be an author?
* **References:** Correctly cite every claim (statement) in the above sections.
* **Appendix:** Long mathematical proofs, extremely large data tables, or code snippets that would dilute the reading flow if placed in the main text.