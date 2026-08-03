"""
Build Master storylines.json from Wikipedia / EverybodyWiki Complete Ground-Truth Guide
"""

import re
import json
import os

wiki_text = """
1
"Introduction"
The narrator of the show Taarak Mehta (Shailesh Lodha) introduces the characters.
2–5
"Mischievous Tapu"
As Tapu is creating problems, it causes trouble for society members and Jethalal.
6–7
"Champaklal's Arrival"
Fed up with little Tapu's mischief, Taarak suggests that Jethalal invite his father Champaklal to teach Tapu good manners.
8–9
"Heavy Rains"
Tapu Sena and Mehta get stuck in the heavy rains of Mumbai, making society members tense. In the end, they return safely.
10–11
"Champaklal's Phone"
Struggling to adjust to the city, Champaklal gets a new phone for day-to-day communication, but this puts society members in trouble. Eventually, he himself returns the mobile.
12–13
"Samuhik Rakshabandhan"
Bhide is worried about Tapu and Sonu's closeness and convinces members of Gokuldham society to celebrate 'Samuhik Rakshabandhan'. However, Jethalal doesn't want Babita to tie him "Rakhi", so he revolts and fails. In the end, neither Tapu nor Jethalal ties Rakhis, much to Iyer and Bhide's chagrin.
14–15
"Jethalal Kidnapped"
Jethalal gets kidnapped from his shop by a bunch of thugs who seek a ransom in exchange for returning him. Later, with the help of Tapu, Abdul and Mehta, the Gada family rescues him from the kidnappers.
16–17
"Janamashtami (2008)"
Jethalal and his friends plan to gamble, while on the eve of Janamashtami the men challenge the women to break Dahi Handi.
18
"Champaklal as Tapu's Father"
Tapu convinces Champaklal to meet his principal as his father after he lands in trouble at school. Things take a different turn when Jethalal arrives at the school too.
19–20
"Chingur Baba's help"
Fed up with his father and son, Jethalal approaches Chingur Baba for help which eventually causes him more trouble.
21–22
"Kevra Teej"
Women of Gokuldham Society want their husbands to fast for them on the festival of Teej. Despite their early determination, the hungry men decide to meet at a restaurant, but are applauded by their wives when they decide not to eat.
23–27
"Ganesh Utsav (2008)"
Besides lots of trouble and chaos, members of Gokuldham society celebrate the festival of Ganesh Chaturthi.
28–29
"Hasya Kavi Sammelan"
A Hasya Kavi Sammelan is organized on the occasion of Ganesh Utsav.
30–34
"Helpless Husbands"
All men of the society are upset with their wives. They meet Gobachari (Taarak's friend) who brainwashes them against their wives.
35–38
"Tapu Sena & Television"
Parents are worried as Tapu Sena is watching TV all day.
39–44
"Navratri (2008)"
Society members celebrate the auspicious festival of Navratri.
45–49
"Kidney for Shaikh"
A Dubai Shaikh offers an extravagant amount of money to Jethalal for a kidney, but the latter falls in great trouble when he is unable to find a donor.
50–54
"Diwali (2008)"
Bhide urgently needs money for Diwali expenses. Gokuldham celebrates the festival of Diwali.
55–61
"Sundar's Scheme"
Daya's brother Sundar brings a scheme for Gokuldham members and promises to double their money but promptly disappears. Jethalal is then forced to repay the money but fortunately, Sundar arrives with the money at the right time.
62–63
"Havan to end TV strike"
Women are angry as the same episodes are being telecast due to a strike. Daya and her friends conduct a 'havan' to resolve this problem.
64–65
"Tapu sena strike in school"
Inspired by the strike of the television workers, Tapu Sena decides to strike against their school, making their principal tense. However, Champaklal convinces the kids to end the strike.
66–69
"Jethalal's affair with Sweety"
A woman named Sweety (portrayed by Surbhi Chandna) comes and makes everyone believe that Jethalal has an affair with her. Later, it is revealed that she was an old employee of Jethalal and came to get a ransom by threatening Jethalal.
70–83
"Tapu's Wedding"
Champaklal wants to have Tapu get married during his childhood as he was, but society members and Jethalal oppose this. Amidst some misunderstandings, Champaklal finally finds a girl for Tapu, but she is older than him. Jethalal also had a dream of Tapu getting married. After explaining to Champaklal about the disadvantages of child marriage, he understands and drops the idea of Tapu's marriage.
84–86
"Drunk Sodhi on Terrace"
Getting warned by Roshan, Sodhi returns home drunk again, so Roshan refuses to let him enter the house. As a result, Sodhi stands at the edge of the building roof until she forgives him. Later, Sodhi's relatives come into the society and Roshan agrees.
87
"Lohri Eve"
Gokuldham society celebrates the festival of Lohri with Sodhi's relatives who came from Punjab.
88–89
"Makar Sankranti"
On the occasion of Makar Sankranti, there is a kite competition between Jethalal and Sodhi with a condition that whoever loses will sit on a donkey. Later, both of their kites get lost, and the competition ends in a tie.
90–91
"Dr. Hathi stuck in Rickshaw"
Dr. Hathi arrives in the society, but he gets stuck and struggles to get out of a rickshaw. The members of Gokuldham form a human chain to pull him out.
92–93
"Republic Day plans"
All society members initially have separate plans for the Republic Day holiday, but eventually, all of them decide to celebrate Republic Day together.
94–95
"Cultural Dance Program"
To celebrate the dignity of India, a Cultural Dance program was organized, where all society members perform traditional dances. Daya and Jethalal are declared winners of the program, which sparks a conflict between the members based on state and regions.
96–100
"Jethalal Fitness"
Seeing Jethalal getting fat, Babita advises him to follow a proper diet and exercise along with other society members and her in the early morning. During exercise, he thinks Babita's mobile has been stolen so he chases after the thief; as a result, he gets tired the very first day and quits.
100–106
"Donations leads to Jail"
After a movie night, Champaklal feels pity seeing poor people and donates blankets to them, but later learns that they sold them for money, resulting in his arrest. Later, the thief is caught, and Champaklal is released.
107–114
"Lovely Housemaid"
Society women were upset as their beloved maid Rukmini leaves the society. All members become tense about household chores. Consequently, a new maid named Lovely comes and tries to steal and divide the women in society. Eventually, Lovely is exposed, and Rukmini comes back to the society.
115–117
"Bhide swallows a whistle"
Abdul is selling a free whistle with toothpaste in a scheme. Bhide accidentally swallows a whistle, making him unable to speak. All members fail to get the whistle out of Bhide's stomach. Later, Daya uniquely solves the problem.
118–122
"Holi with Duplicate Shahrukh and Sachin"
Bhide decides that society will not celebrate Holi due to funding issues. Consequently, Sundar comes with a promise to bring Sachin Tendulkar and Shahrukh Khan to celebrate Holi. Later, they are revealed to be duplicates.
122–125
"Chaggan, Maggan and 25000 rupee"
Sundar tells Jethalal to give 20,000 rupees and 5,000 rupees to his friends Chaggan and Maggan respectively, who are in Mumbai. This leads to a lot of confusion and chaos.
125
"Vinay Pathak in Society"
Vinay Pathak made a special appearance as Taarak's friend to promote his film Straight-Ek Tedhi Medhi Love Story.
126–129
"Tapu Sena exams scam"
The lives of the society members revolve around their children's exams. Starting with Tapu's refusal to write his exam, the story goes around the cheating efforts of Tapu in his exams with the help of Abdul. Bhide comes to know that Tapu is going to buy a question paper from the peon, Pappu, but the plan fails as the police inspector arrives and reveals that Tapu complained about Pappu and his scam.
130–132
"Iyer and Babita fight"
The society members are shocked as Iyer and Babita suddenly start fighting. Using this as an advantage, Jethalal eagerly tries to get them divorced. Later, it is revealed that it was an April Fool prank by Iyer and Babita which consequently ends with a prank by society members on them.
133–134
"Mahavir Jayanti"
Gada family organize Mahavir Jayanti function in the society.
135–138
"Dental Camp in Gokuldham & Jethalal Toothache"
A dental camp is held by Dr. Hathi and Dr. Kukutiya. The doctors praise Jethalal for having strong teeth. Later after the camp, Jethalal gets pain in his teeth due to Tapu, and is scared to go to a dentist. Under pressure from everyone, he agrees to go to the dentist with Taarak. Later, a hooligan enters the clinic and gives a tight slap to Jethalal which breaks his tooth and ends his toothache.
139–142
"Meenakshi Detergent"
While buying detergent Taarak mistakenly criticizes Meenakshi detergent which was forcefully sold to him by the shopkeeper. Later, Jaggu, Meenakshi's husband comes to the society to beat Mehta. Finally, he and Jethalal successfully convince Jaggu.
143–147
"Tiku Ji ki Wadi Trip"
Kids of Gokuldham wanted to go for a picnic during their vacation but their fathers were busy with their work. So, the kids' mothers along with Champaklal take them to Tiku Ji ki Wadi for a picnic. Later, when Gogi goes missing, the members find him sleeping in the park.
148–152
"Daya and Madhavi Fight in Kitty Party"
Women decide to organize their first kitty party. Bhide doesn't agree to this as it is against their cultural morals but eventually, Madhavi convinces him. In a game to act like their husbands, Daya and Madhavi argue. In the end, Tapu and Sonu solve their fight and the ladies agree to plan their next kitty party.
153–163
"Thieves"
A group of thieves steal a gold necklace from Anjali, and then loot Mohanlal's flat. They then try to rob Jethalal masquerading as mechanics, but they are caught by Tapu Sena who hands them over to the police.
164
"Tobacco Free Mumbai"
Tapu Sena and Mahila Mandal (Society women) spread awareness to help prevent people from eating tobacco.
165–168
"Patrakar Popatlal"
A newspaper journalist, Popatlal Pandey is transferred back to Mumbai.
169–173
"Daya's Maun Vrat"
After a deal with a Chinese client falls through due to Daya's interference, Jethalal says that Daya shouldn't talk to anyone. She takes his statement literally, making Jethalal depressed. Eventually, Daya breaks her silence.
174–184
"GPL 1"
The society members play a friendly cricket tournament divided into two teams, "Jabardast Jetha" and "Bindaas Bhide" led by Jethalal and Bhide, respectively. The match result doesn't come out due to not receiving any permits from police for a night tournament and it ends in a tie.
185–187
"Jethalal Gets Annoyed by a Kid"
Jethalal wants to sleep all day long because of the fatigue of GPL 1. However, Daya's friend leaves her son at Jethalal's house and goes shopping with Daya, and her son annoys Jethalal all day.
188
"Dr Hathi in tempo"
Dr Hathi arrives in the society after a break. However, he is stuck in a tempo while eating bananas, so the society eventually manages to get him out after many difficulties.
189–195
"Babita birthday"
Iyer arranges a surprise birthday party for Babita and plans to not invite Jethalal. Eventually, Jethalal gets invited after Babita figures out he has not been invited.
205–244
"Jethalal London Trip and Kerry in India"
Jethalal goes to London for a business trip. There, he meets Kerry and invites her to India. When she arrives in India, Daya assumes that Jethalal has an affair with her. Later, the confusion is cleared, but Popatlal falls in love with Kerry and tries to marry her. However, it is revealed that Kerry loves someone else, so Popatlal is still a bachelor.
259–272
"Tapu Sena Audition"
Tapu Sena get a chance to audition for an ad by Rita.
325–331
"Holi (2010)"
Members of Gokuldham society celebrate the festival of Holi.
355–364
"Saree sale at Bhatiawadi"
Mahila Mandal buy defective sarees, but the saree seller alleges that Mahila Mandal did not buy sarees since they don't have a bill. So Mahila Mandal retaliates by doing a Garba Andolan in front of the shop.
367–371
"Childhood Games"
All the parents are worried as Tapu Sena keeps watching devices all day. Champaklal advises the parents to play their childhood games with their children.
390–402
"GPL 2"
Tapu Sena, tired of their boring vacation, plan GPL 2 with the help of Sundar. Jethalal is caught in crossfire since Daya and Babita are the captains with the team names "Daya Dandiya Devils" and "Blaster Babita". Daya's team wins the match while Babita's team loses.
403–409
"Sodhi meets Irfan Pathan"
Irfan Pathan is impressed by Sodhi's game in GPL-2, which was telecast LIVE on TV. Sodhi being on cloud nine decides to meet Irfan Pathan at his house in Vadodara.
409–412
"Shampoo Massage"
While Daya massages Jethalal's head, she mistakenly applies shampoo instead of oil, making his hair spiked. Iyer laughs at him and clicks a photo, so the humiliated Jethalal does the same to Iyer.
413–425
"Ghost In Gokuldham"
A woman in a white saree who resembles a ghost constantly terrorizes Gokuldham Society members. Despite repeated attempts to drive her away, she doesn't listen and threatens them. Tapu Sena and Rita suspect foul play and uncover that the ghost is a criminal who used to terrorize Gokuldham members so that they could carry out their illegal activities smoothly. Their cover is blown by Tapu's plan and Gokuldham is saved from the fake ghost.
426–434
"Popatlal and Koyal"
Koyal, Taarak Mehta's sister-in-law, comes to Gokuldham society to stay with him for a few days while waiting for a visa to go to London. Meanwhile, Popatlal falls in love with Koyal and tries to impress and marry her. Koyal considers it a joke but later regrets it. In the end, Popatlal remains single.
435–436
"Eid Celebration"
The members of the society celebrate Eid with Abdul.
437–444
"Dahi Handi (2010)"
Gokuldham's Dahi Handi event becomes a competition between the men and the women. After breaking Dahi Handi, Daya falls and is admitted to the hospital. Later, she recovers and gets discharged from the hospital.
445–452
"Ganesh Utsav (2010)"
Gokuldham Sangeet Samrat event is organized on the occasion of Ganesh Utsav.
461–471
"Babita & Iyer's marriage anniversary"
Iyer buys a sports car for Babita on their wedding anniversary, but it proves to be stolen. Inspector Chalu Pandey gives them a 72-hour deadline to prove their innocence and to catch the dealer. Jethalal poses as a Sheikh from Dubai who wants the car, and the dealer is trapped and arrested.
474–481
"Chandiramani Flat Auction"
Chandiramani sells his Gokuldham flat. Jethalal and Sodhi both are interested, so he organizes an auction. However, Champaklal explains to everyone it's wrong to sell the house via auction, so Chandiramani reverses his decision.
482–483
"Goli Misses His Father"
To lose weight, Hathi visits a naturopathy camp for some days. However, Goli misses him and asks his mother to bring back his father. So, Mehta advises his mother to call Goli's paternal uncles to their home so that he doesn't feel alone.
488–491
"Daya doesn't respond from locked home"
When Daya mistakenly spoils Jethalal's INR 15 Lakh cheque by pouring tea on it, he harshly insults her. When Jethalal realizes his mistake, he tries to call her from his shop and even comes to society to talk but she doesn't respond from the locked house. After some time, with the help of society members, they come to know that she was sleeping after having cough syrup and Jethalal apologizes.
492–498
"Magic Show in Society"
Tapu Sena faces a lot of trouble while playing cricket on their vacations, so they ask Mehta about any other vacation plans. During this chat, Mehta's childhood friend Magician Munnalal calls him, and Mehta invites him to do a magic show in their society. After the show, Tapu Sena urges Mehta to tell his friend to teach them some magic tips. After learning magic, Tapu Sena makes some mistakes in their society and later they apologize for it.
501–506
"Ladies get credit cards"
Ladies are fascinated by the credit card, and they all get one, but later they come to know that the bank is fraudulent.
507–510
"Paint cans delivered to Jethalal"
Jethalal acquires paint cans instead of money and doesn't know what to do with them.
537–541
"Tapu goes bald"
Tapu is adamant about going bald even after everyone requests him not to. Eventually, he does, and the reason turns out to be that his classmate, who was suffering from cancer, is bald and students were bullying him.
541–550
"Baijanti's wrong number"
When Popatlal goes to the hotel, he sees a woman named Baijanti. He secretly notes her mobile number and often calls her, but it mistakenly belongs to Babita.
551–558
"Mahashivratri"
Popatlal visits a pandit who tells him to do special pooja for Mahashivatri so that his marriage takes place. Although everyone is ready for the function, Jethalal, who had gone early to clear a payment, eats 'Bhang' and is uncontrollable. However, with Taarak's help, Jethalal becomes normal.
564–572
"Sundar's 30 lakh scam"
Sundar takes a loan from a moneylender but doesn't repay it and hides in Jethalal's house. Later all the misunderstandings are cleared.
578–587
"Bhide's 1 Crore Email Fraud"
According to an email, Bhide discovers that he has won INR 1 crore, so he pays a deposit for the prize money. But later he comes to understand that he has been defrauded, so society members help him to recover his money and arrest those frauds.
588–596
"Jetha's Dadaji's Photo"
Jethalal's wallet is stolen which contains the only photo of his grandfather late Jayantilal Gada. Later the thief himself returns the wallet at Jethalal's home after getting to know about sentimental reasons.
597–604
"Sodhi Swallows Glass"
Sodhi believes he swallowed a piece of glass while drinking at a party and has to undergo an operation. In the end, it is revealed it was a piece of ice.
605–614
"Bhide Sells Mangoes"
Bhide starts a business selling mangoes from his Bhau Kaka in Ratnagiri, but the mangoes prove to be rotten, infuriating Jethalal.
615–620
"Tapu Sena Hunger Strike"
To get season balls and cricket bats Tapu Sena go for a hunger strike.
621–622
"Ready"
Salman Khan visits Gokuldham Society to promote Ready.
623–637
"Gokuldham Khel Mahotsav"
Tapu Sena & Champaklal organize a sports and games event for the members of Gokuldham society. Nattu Kaka and Bagha are invited as judges.
638–646
"Chaddi Gang Part 1"
Mistakenly, Jethalal is stuck in his godown for the whole night. Later, a thief gang named Chaddi Gang enters the godown and tries to steal the electronic items from there. But, with the help of the Gada family, the members of the Chaddi Gang are arrested.
647–653
"Popatlal and his umbrella"
Lonely, single and desperate, Popatlal organizes a birthday party for his sole companion of 10 years, an umbrella. However, the party comes to a halt when the umbrella is stolen and subsequently found damaged. Later it is found out that the umbrella was broken by a waiter who was unable to celebrate his anniversary with his wife.
653–658
"Extra class"
Tapu Sena is frustrated when Bhide holds extra tuition classes on weekends.
659–677
"Chaddi Gang Part 2"
The story continues from where it left off with the Chaddi Gang's leader's sister getting to know that he's in jail. She then forces her brother Rana to free the leader, or there will be terrible consequences. So he kidnaps Daya, but later on he eventually apologizes and realizes his mistakes as a criminal in the underworld.
678
"Janmashtamani (2011)"
The members of Gokuldham celebrate Janmashtami and find out who will get a chance to break Dahi Handi.
679–681
"Dahi handi (2011)"
Dr. Hathi is selected to break the Dahi Handi, making everyone shocked, because they don't know how Hathi will do it.
686–695
"Ganesh Utsav (2011)"
Gokuldham has a fancy dress competition on the occasion of Ganesh Utsav.
701–706
"The 80,000-horse statue"
Sundar parcels an expensive horse statue to Jethalal to take care of it, but everyone in Gokuldham Society breaks it.
707–710
"Navratri (2011)"
Falguni Pathak comes to Gokuldham society on the occasion of Navratri.
711–715
"Dusherra (2011)"
Jethalal dreams of Ravana and decides not to burn it and asks society members to do the same.
719–722
"Iyer's interview in the newspaper"
Iyer is excited as his interview is published in the newspaper, but his house newspaper is swapped.
723–725
"Babita and Iyer buy a fridge"
Babita and Iyer decide to buy a new refrigerator, resulting in much confusion.
726–728
"Diwali (2011)"
Gokuldham celebrates Diwali with the poor and underprivileged.
729–732
"Lottery tickets"
Bhide and Mehta buy lottery tickets and hope to win. However, Bhide changes the tickets with Mehta based on his lucky numbers, in the hope of getting his winning ticket.
785–789
"Bhide's new pair of glasses"
Bhide, as usual, blames Tapu for his broken glasses. Finally, Sonu accepts that it was her mistake.
790–810
"Jethalal In Pakistan"
Jethalal takes the members of Gokuldham to Kutch and they enjoy the visit. But Jethalal is led astray by a camel and crosses the border into Pakistan. There, Jethalal is investigated by Karim Khan. The Gada family reaches Delhi for help. Jethalal's grandfather helped Karim Khan's grandfather during the 1947 partition, so Khan releases Jethalal and he safely returns to India.
811–818
"Popatlal, Señorita & Kalavati"
Two different families simultaneously come to meet Popatlal for marriage meetings. One family is known to Daya, while the other is known to the Hathi family. With a plan, Popatlal tries to simultaneously meet both parties at different houses with two different characters, but the truth comes out and both families reject Popatlal for hiding the truth.
825–839
"Society Renovation by Sundarlal"
The renovation work of the society is given to Sundarlal. However, Jethalal doubts if he will do it properly or not.
840–847
"Disco Dance Competition"
To celebrate the new society, a disco dance contest is organized with an imported car as the prize.
848–851
"Abdul's New Shop"
Upset by the comments that his shop looks old, Abdul decides to leave Gokuldham Society forever, but the society members surprise him with a new and renovated shop.
852–856
"Girvi Gehne"
Jethalal decides to sell the mortgaged jewellery, unaware that it belongs to Daya.
857–867
"Gandhi Maidaan"
The society members decide to use Gandhiji's methods and teachings to stop the construction in Gandhi Maidaan.
868–870
"Iyer forgets his briefcase"
Iyer forgets his briefcase with important documents at Jethalal's store, and Jethalal must deliver it in time.
871–872
"Mother's Day"
Tapu Sena surprise their mothers and celebrate Mother's Day.
873–878
"Lord Ganesh Sculpture"
The ladies unintentionally purchase and parcel an expensive idol of Lord Ganesha but are stuck in the shop when they can't pay.
881–886
"Jethalal Gets Electric Shock"
Jethalal is electrocuted at Babita's house while repairing her tubelight and develops a phobia of electricity.
887–891
"Society Bhangaar"
Tapu decides to sell the "society bhangaar" (trash), but also sells Bhide's scooter, making Bhide very angry.
891–896
"Ferrari Ki Sawaari"
Sharman Joshi and Boman Irani visit Gokuldham to promote Ferrari Ki Sawaari.
897–901
"Jethalal fights with everyone"
Jethalal misplaces a Rs. 25 lakh cheque and angrily fights with everyone.
905–911
"Bol Bachchan press conference"
Society members pretend to be reporters to attend the Bol Bachchan press conference.
912–914
"Bhide's moustache"
Bhide's fake moustache is stuck, and everyone tries different ways to remove it.
915–922
"Jethalal gives bribe"
Gents plan to party, but in a hurry, they enter a no-entry road. Jethalal tries to pay his way out, but the honest policeman asks him to get his father to the police station. He requests Daya to act as his mother and go to the police station but gets caught when Champaklal also arrives at the police station.
923–928
"Choco Moco Chocolate"
Babita throws away the chocolate gifted by Jethalal. Seeing this he is devastated but later all the confusions are cleared.
929–932
"Raksha-bandhan (2012)"
After Tapu protects a girl named Jiya in school, she ties him a rakhi.
933–941
"Dahi Handi (2012)"
A gangster hides a diamond inside Gokuldham's Dahi Handi.
942–945
"Eid (2012)"
Because Abdul misses his family, Gokuldham invite them and grandly celebrate Eid.
946–951
"Jethalal and Passport"
Jethalal is arrested after he takes the passport of a young boy who had hit Jethalal with his bike, but that boy is Champaklal's friend's grandson.
952–963
"Barfi"
Ranbir Kapoor visits to promote the film Barfi!.
968–980
"Ganesh Utsav (2012)"
A Grand Antakshari event, hosted by Amit Mistry, is organized on the occasion of Ganesh Utsav, which Tapu's team wins.
983–1000
"Sundar brings Chanya-Choli"
Sundar starts a business of Chanya-Choli on Navratri, which becomes a headache for Jethalal. Later, he holds a havan to get rid of Sundar.
1001–1009
"1000 Episodes Celebration"
Ajay Devgn and Sonakshi Sinha visit Gokuldham Society to promote Son of Sardar. Asit Kumarr Modi introduces the whole crew of TMKOC for the celebration of 1000 happisodes (episodes).
1010–1018
"Blind people donation"
Tapu Sena collects a huge donation as part of their school project for blind people, but Tapu gives it to a fraud blind couple on the road, who are later revealed to be members of the same organization.
1019–1024
"Jewellery Shopping"
Bhide's kaka arrives in Gokuldham Society to buy jewellery for his daughter from Jethalal. However, Jethalal isn't at home and has gone for a weight loss program.
1025–1056
"Gulabo"
A woman from Matkunda, Gulabo, claims Jethalal as her husband showing their marriage certificate, video clips of marriage, and marriage photographs as proof. However, Jethalal says it was a film shooting scene, and society members with the Gada family take Jethalal's side. After that Gulabo files a case in the court, but later she accepts that it was just a film shooting, after Jethalal, seeing no hope to win the case, acts like a hermit. Gulabo then marries Jethalal's lawyer who falls for her upon seeing her for the first time.
1057–1060
"Republic Day (2013)"
Members of Gokuldham society celebrate Republic Day.
1061–1080
"Tapu Sena's new smartphones"
To fulfill a promise, Jethalal has to give a smartphone to Tapu. With Tapu, other members of Tapu Sena request smartphones from their parents. They misuse their new phones and are suspended from school. Later, Tapu Sena understand their mistakes and promise to not overuse the devices.
1081–1088
"Bharti"
A lady named Bharti is found on the terrace and she explains that she was physically harassed by some goons. The society members then teach those goons a lesson.
1089–1112
"Sheru"
A dog seeks shelter in Gokuldham and the members decide to keep him and Daya names him "Sheru". Jethalal is extremely scared of the dog. In the end, Sheru is loved by Jethalal and Champaklal too.
1113–1119
"Gogi at the Gada's"
After Roshan and Sodhi go to Amritsar for family reasons, Gogi stays at the Gada house and annoys Jethalal.
1120–1131
"Sangram Singh's Mango Orchard"
Tapu Sena steal mangoes from the garden of a man named Sangram Singh, who holds Gogi as a punishment.
1132–1137
"Babita's phone number"
Jethalal notes down Babita's cousin's phone number on a cash note and then misplaces it.
1145–1153
"Trucks in Gokuldham"
Three unknown trucks are stuck in the compound without any driver which creates confusion and chaos. Yamla Pagla Deewana 2 film is also promoted. Roshan and Sodhi return at the end from Punjab.
1154–1174
"Khote Classes"
After Sonu tops her school exams, Vishwasrao Khote claims she studied from his classes even though she didn't. Everyone successfully proves Bhide's innocence.
1175–1185
"Taarak's affair with Kavita"
Anjali finds out that Taarak is chatting with a girl named Kavita and suspects he has an affair.
1187–1194
"Gokuldham Society is Sold?"
The Gokuldham members receive a notice from MAC associates. However, it was a prank made by Asit Kumarr Modi, who surprises society members on completing 5 years of the show where Shah Rukh Khan & Rohit Shetty also come to promote Chennai Express.
1195–1202
"Tapu and Champaklal in Paris"
Tapu wins a Smurfs 2 contest and the prize includes a trip to Paris and Brussels.
1203–1206
"Independence Day (2013)"
Couples sing patriotic songs and celebrate Independence Day.
1207–1212
"Raksha Bandhan in Ahmedabad"
Daya and Jethalal travel to Ahmedabad to celebrate Raksha Bandhan with Sundarlal.
1213–1218
"Dahihandi (2013)"
On the occasion of Janmashtami, Lord Krishna himself arrives as a child and breaks the "handi" in Gokuldham and blesses everyone.
1227–1234
"Ganpati Utsav (2013)"
On the occasion of Ganpati Utsav, Tapu Sena organized a Kaun Banega Murga program.
1219–1225
"Jethalal is stalked"
Jethalal is scared as a stranger is continuously stalking and taking his photos. Later, it is revealed that the stranger likes Jethalal's shirts and wanted clothes like his.
1251–1254
"25000 rupees envelope"
Tapu Sena finds an envelope with 25000 rupees in it.
1254–1258
"Champaklal's Hiccups"
Champaklal gets hiccups at midnight and it doesn't stop.
1259–1264
"Bhide's antique radio"
Bhide buys an antique radio, but weird and ghostly events start occurring. Iyer then finds out that "Jadoo" wants to send a message to Krrish.
1265–1269
"Sachin Tendulkar retirement"
Tapu Sena is very sad as their favourite cricketer, Sachin Tendulkar is retiring.
1270–1278
"Necklace Fraud"
Ladies go for a Kitty Party and buy a gold necklace in celebration but find out that it is fake. They decide to catch the thief red-handed and a disguised Daya acts as a rich woman to lure the thief to their trap.
1279–1284
"Onions at Gada Electronics"
A lady named Bawri brought onions in bulk at Gada Electronics and the police raid Gada Electronics and arrest Bagha for keeping onions in bulk quantity.
1285–1308
"Popatlal and Bulbul"
Bulbul escapes two days before her wedding and arrives in Mumbai. While sitting alone in the Shiv temple she meets Popatlal after which Popatlal takes Bulbul to his house and tries to save her from the police. After that, Bulbul's parents find out that Popatlal has Bulbul, so they both decide that Bulbul will marry him. At the time of marriage, everyone understands that Bulbul is in love with Rahul. In the end, Popatlal lets Rahul secretly marry Bulbul and remains single.
1310–1318
"Jalsa Party 2014"
Sundarlal organizes Jalsa Party 2014.
1319–1326
"Bagha messed everything up"
Bagha messes everything up. Later Jethalal finds out that Bawri proposes to Bagha; because of that, Bagha had been messing everything up, and later Bagha accepts Bawri's proposal.
1327–1341
"Fitness Camp"
The ladies organize a fitness camp in the society and Babita invites her friend Sofia (played by Nigaar Khan) to conduct it. However, Jethalal suffers a painful sprain in his waist during the camp.
1342–1346
"Anjali demands a surprise gift"
Anjali wants a gift from Taarak, but he has no idea what to gift her.
1347–1353
"Tapu Sena extra classes"
Tapu Sena lies about attending extra classes, so no one knows where they go. Later, society members come to know that they go to teach poor and needy kids who want to study.
1354–1361
"Bhide-Madhavi anniversary"
Society members organize a surprise anniversary party for Bhide and Madhavi.
1362–1364
"Holi (2014)"
Various reasons cause Holi to be cancelled.
1365–1369
"Youngistaan"
Jackky Bhagnani and Neha Sharma visit Gokuldham Society to promote their film Youngistaan.
1370–1378
"Sodhi is Missing"
Sodhi is kidnapped by some Sardars, and society members search for him. In the end, they meet him at a Gurudwara.
1379–1380
"Varun Dhawan in Gokuldham"
Varun Dhawan visits to promote his film Main Tera Hero.
1382–1387
"Bhoothnath Returns"
The society members experience paranormal activities in the society, which was done by Amitabh Bachchan himself who visits Gokuldham society to promote Bhoothnath Returns.
1408–1419
"Adventure Park Surprise"
Bhide gives a surprise to Tapu Sena – a visit to an adventure park.
1420–1425
"Iyyer's Promotion Party"
Krishnan Subramaniam Iyyer's Promotion Story.
1426–1445
"GPL 3"
Mehta hits a six on Tapu's ball which spills Jethalal's Jalebi Fafda. This results in GPL 3 with Jethalal and Mehta being captains. Jethalal's team is named as "Jetha Ke Jaanbaaz" while Mehta's team is named as "Mehta Ke Maharathi". Jethalal's team eventually wins the match while everyone eats Jalebi Fafda after it ends.
1447–1465
"10 Crore Ruby"
A mysterious man who reveals himself to be Ajay Dewan secretly comes to the Gokuldham Society in disguise which creates a suspicion in the society members' minds. He reveals that he is in Mumbai to sell a ruby which is worth 10 crore. But one day both Ajay Dewan and the ruby go missing, causing the society members to call in the CID cops to investigate.
1465–1478
"Hongkong-Disneyland trip"
The members of Gokuldham society win a trip to Hongkong-Disneyland in Tapu Sena's lottery and the whole society except for the Mehta family, Iyer and Popatlal fly to Hongkong.
1489–1499
"Ganesh Utsav (2014)"
Members of Gokuldham society celebrate Ganesh Utsav.
1500–1507
"Bhide's surprise treat (1500 Episodes Celebration)"
Bhide arranges a surprise and takes everyone out for a day for Mumbai Darshan.
1518–1524
"Swachh Bharat Abhiyaan"
The ladies have their husbands help them to clean the society as part of the Swachh Bharat Mission.
1525–1532
"Diwali (2014)"
The team of Happy New Year visit Gokuldham to promote their film and celebrate Diwali.
1533–1541
"Popatlal purchases a new phone"
Popatlal buys a new phone from Jethalal's shop to replace his damaged old phone. But his nitpicking while shopping annoys Jethalal, so he plays a prank using Popatlal's phone.
1546–1557
"Daya's Mother"
Everyone is very excited to meet Daya's mother as she is coming to Mumbai to receive her Samaj Ratna award. But it is revealed that Sundar is the one who is acting as Daya's mother. Everyone is shocked but later all the misunderstandings are clear.
1566–1572
"Kathiawadi food"
Daya promises to cook royal Kathiawadi food, but there is a delay, infuriating Jethalal.
1573–1585
"Champaklal is drunk?/New Year (2015)"
The gents decide to secretly drink amidst the new year party, but Champaklal, to catch them, acts drunk.
1589–1595
"Bhide's Sakharam"
Madhavi buys a new scooter for Bhide with help from Champaklal.
1599–1609
"Winter Party"
The ladies of Gokuldham society celebrate a winter party by organizing a 'No.1 Dil Todne Wala' Poetry Program.
1611
"Hey Bro"
Ganesh Acharya visits Gokuldham to promote Hey Bro.
1624–1629
"Bawri brings luck to Gada Electronics"
Jethalal is upset due to his business not running well, so Bawri brings customers to Gada Electronics from another electronics store. Because of this, Jethalal thinks that his luck has improved due to Bawri. Then the chairman of the electronic union calls Jethalal and tells him everything, and later Jethalal apologizes to everyone for this incident.
1640–1663
"Daya brings a baby girl to Gokuldham"
Daya is at the hospital helping with a delivery. She leaves the hospital and tries to find an auto rickshaw. She hears the baby girl crying. She takes the baby girl to the society, and they name her Khushi.
1686–1723
"Tapu Sena's SSC result and college admission"
Tapu Sena gets a good result in SSC boards, but only Tapu, from Tapu Sena, struggles to get admission in M.K. Gandhi college. I.M. Khare is a corrupt trustee and the Gokuldham members expose him.
1758–1808
"Interior renovation"
Due to rising problems in their flats, the Gokuldham members decide to renovate their interiors and face many hurdles.
1822–1824
"Conspiracy against Tapu"
A boy, Vicky, in Tapu's college throws a plane made from Tapu's notebook page at Professor Nalini. She takes Tapu's ID card as punishment and tells him to bring his father to school. Meanwhile, Tapu disguises Popatlal as Jethalal and brings him to college.
1824–1826
"Prof. Nalini's Rishta with Popatlal"
Popatlal goes to meet with a girl for his marriage, who turns out to be Tapu's professor Nalini and she rejects Popatlal.
1827–1829
"Promotion of Dilwale"
As Nalini rejects Popatlal, he is very sad and Asit Modi brings Shahrukh Khan and Kajol to make him happy and as well as for the promotion of Dilwale.
1831–1842
"Babita's image on the Tobacco hoarding"
Since teenage Babita dreams to be a model but can't. When Jethalal finds out, he helps her get a chance to do an advertisement, unaware that the advertisement promotes tobacco.
1868–1888
"The gold biscuit briefcase"
While going to collect a payment, Bhide saves a man Dhanraj from an accident, for which he is rewarded which leads Bhide to big trouble.
1909–1934
"Iyer-Babita Divorce"
A miscommunication over mobile creates confusion between Iyer and Babita, eventually leading to divorce.
2007–2022
"10 crore saree"
Daya and the other ladies of Gokuldham wish to wear a 10-crore saree they saw in a diamond exhibition. They request Jethalal to arrange it for one day. Jethalal arranges a duplicate saree for them. Later, he and Mehta are arrested when the real saree is stolen on the same day. But the main thief of the saree turns out to be the 10-crore saree-owner's wife.
2023–2030
"Ganesh Utsav (2016)"
Members of Gokuldham society celebrate Ganesh Utsav.
2095–2102
"Ghanchakkar In Shop"
A strange fellow invades Jethalal's shop and calls it his own. Later, he follows Jethalal to society and calls things his own too.
2235–2246
"Goa trip"
Tapu Sena arranges to visit Goa with society members.
2247
"Mubarakan team in Gokuldham"
The team of Mubarakan (2017), visit Gokuldham Society after their return from Goa.
2283–2290
"Ganesh Utsav (2017)"
Gokuldham society celebrates the festival of Ganesh Chaturthi and organizes the "Divya Veshbhusha" program.
2384–2415
"Pinku's Parents"
The residents of Gokuldham society come to know that Pinku's parents work in a secret government agency after many twists and turns.
2493–2511
"Señorika Island"
Champaklal dreams that his son is involved in a 300-crore bank-loan scam and has escaped to an island country called Señorika Island. However, even after he wakes up, he fears that his dream will come true. Later, Jethalal returns and Champaklal is relieved.
2605–2632
"Gada Electronics on sale"
Nattu Kaka and Bagha sell Gada Electronics to Soorma Bhai without Jethalal's consent.
2644–2649
"Statue of Unity trip"
The residents of Gokuldham visit the world's tallest statue, the Statue of Unity in Narmada, Gujarat.
2693–2708
"Singapore trip"
Asit Kumarr Modi arranges a Singapore trip for Gokuldham members to make depressed Popatlal happy.
2812–2824
"Ganesh Utsav (2019)"
The members of Gokuldham society celebrate Ganesh Utsav.
2982–2996
"Ganesh Utsav (2020)"
The members of the society celebrate Ganesh Utsav during the COVID-19 pandemic following all safety measures.
3004–3008
"Abdul has corona?"
The residents of Gokuldham society suspect that Abdul has corona, so they take tests to see if anyone has the virus. In the end, no one has the virus.
3009
"Romantic song"
Taarak is annoyed with his lockdown life and wants to escape it. Later, Goli boasts about him changing from Goli to Gulabkumar. Anjali surprises Taarak with pakora and masala tea, so he becomes happy and sings a romantic song.
3010
"Musical memory of S. P. Balasubrahmanyam"
The Gokuldham residents sing songs in the remembrance of the Indian playback singer S. P. Balasubrahmanyam.
3014–3017
"Life in lockdown"
Champaklal calls the Gokuldham residents to know how their lives are going during the lockdown.
3020–3026
"Navratri 2020"
Gokuldham society celebrates Navratri whilst following all the safety measures of COVID-19.
3029–3030
"Online meeting"
The Gokuldham residents gather in an online meeting to see how things are going for them in lockdown and how they are doing.
3032–3033
"Jethalal fights corona"
In a dream, Jethalal is approached by corona who is ready to attack him but Jethalal retaliates and fights back. However, in reality, he is attacking Champaklal, which leads to Champaklal running out of the house to escape Jethalal but he still follows him in sleep. Champaklal hits him so Jethalal comes back to his senses.
3035–3050
"Popatlal loses job"
Due to the coronavirus pandemic and the lockdown, Popatlal's newspaper agency Toofan Express shuts down and he becomes unemployed. He tries for different jobs but fails each time. In the end, Popatlal eventually gets his job back.
3051–3062
"Tapu Sena's Pizza Party"
Bhide advises Tapu Sena not to eat food from outside. However, Tapu Sena plans to order pizza from a restaurant without anyone knowing. They buy the food with the help of Abdul and eat it at Taarak Mehta's house. Anjali is surprised to find the pizza boxes at home and accuses Mehta of eating without her knowledge, but Dr. Hathi finds the truth.
3063–3071
"New Year Party 2021"
Tapu Sena want to have a new year party, but Bhide refuses. Then after a meeting, it is decided the party will happen, but Champaklal will do the arrangement without help.
3074–3083
"Popatlal's shaadi"
Bhide sees a woman in Popatlal's balcony and assumes her to be Popatlal's wife. The news spreads but Jethalal thinks that Bhide remarried due to a misunderstanding caused by a communication gap. Taarak and Jethalal set out to punish Bhide, but they eventually learn about Bhide being innocent. The woman on the balcony turns out to be Iyer's cousin's wife.
3140–3147
"Popatlal And Pooja"
Popatlal gets a call from his fan who is also a journalist, Pooja, and he falls in love with her. Pooja arrives at the society, and says she has made Popatlal her guruji (teacher). Popatlal is heartbroken.
3158–3193
"Popatlal on Mission Kala Kauva"
Popatlal and his co-worker Bharti expose a gang that black-marketed COVID-19 drugs, oxygen cylinders, and COVID-19 vaccines during the second wave. They reach Rang Tarang resort and are assisted by Dr. Hathi, Jethalal, Bagha, and Champaklal.
3194–3221
"Gokuldham in Rang Tarang Resort"
After the events of mission Kala Kauva, the Gokuldham residents are invited to Rang Tarang Resort.
3268–3277
"Bhide's cheque"
Tapu Sena is given the task to deposit Bhide's cheque but because of Goli eating Pani Puri, the cheque is lost. Tapu Sena lie consistently, unaware that everyone knows the truth.
3316–3322
"Madhavi's burnt saree"
Bhide accidentally burns Madhavi's favorite saree gifted by her brother whilst ironing and goes on a mission to buy a new one.
3323–3326
"Gokuldham in Kaun Banega Crorepati"
Asit Kumarr Modi surprises everyone with an invitation to KBC-13 by Amitabh Bachchan.
3327–3332
"Marriage Proposals for Popatlal"
After getting Amitabh Bachchan's special mention for Popatlal's marriage on KBC-13, two different families come to Gokuldham for marriage meeting simultaneously in Hathi and Bhide's house. As a plan, Popatlal tries hard to meet both the families sitting in Bhide & Hathi's homes simultaneously. But later they learn that no one came to the society for a marriage meeting.
3334–3337
"Popatlal Sherwani Curse"
Popatlal thinks his Sherwani is stopping him from getting married, so he gets rid of it, but it always comes back to him. Eventually, he throws it out from his balcony, and it lands on Bhide while driving, which causes chaos in the society.
3338–3360
"Karela Bhoot in Taarak"
Out of greed for food, Goli spies on Taarak and reports to Anjali. She finds out Taarak eats at a hotel secretly. Because of this she uses the "Khiladi" diet, but Taarak and Tapu Sena come up with a plan of "Karela Bhoot" to escape it. Anjali gets to know the truth and decides to teach Taarak a lesson with the help of Champaklal and Mahila Mandal's plan.
3361–3368
"Network problem"
Jethalal gets a big order and has a meeting the next day, but forgets his keys when he arrives at his shop. He calls Champaklal to get the keys ready but because of the network problem they misunderstand each other and do the opposite of what the other person said. Bhide helps Champaklal but gets caught by the police numerous times because of Champaklal disturbing him. Champaklal gets lost but successfully gets Jethalal the deal.
3368
"Tapu and Sonu as Couple"
Bhide ponders the question of Sonu's future. He doesn't want Sonu to marry Tapu but Madhavi explains to him that Tapu Sena is always together.
3369–3373
"The Second Deal"
Because of the events of the network problem Jethalal forgot he had another deal. In the end, he gets his deal.
3373–3384
"Party Sharty"
After the events of the second deal, Jethalal decides to host a party for the Purush Mandal and gets permission from the Mahila Mandal and they start. But a rat goes on Jethalal's leg, and he drops the bottle and it smashes. Then they go to Jhoom Jhoom restaurant to party, but the police spill their liquor.
3385–3387
"Popatlal vs Bhide"
Popatlal throws water on Bhide and therefore Bhide is angry and doesn't want to talk to him anymore. Popatlal needs to update his bank account so he politely asks Bhide to drop him off at the bank. Bhide refuses so Popatlal insults him. Madhavi explains to Bhide that they are friends so they finally make peace with each other.
3388–3410
"Cat in Gokuldham"
Goli and Gogi get a cat into the society, making Tapu Sena extremely happy and the gang decide to name the cat Pompom and raise it secretly in the clubhouse with Abdul's help. But it creates problems for the society members, especially for Jethalal, Popatlal and Bhide as Popatlal's expected bride's father breaks the relation twice due to his superstitions related to cats and Champaklal having sneeze allergy from cats. However, Tapu Sena promise amongst themselves not to get separated from Pompom. But as the problems increase amongst society members they decide to reveal their secret of raising Pompom in the society clubhouse.
3411–3432
"Champaklal's party sharty"
After the events following the Pompom incident, Tapu Sena decides to go for a short trip to Lonavala for a friend's birthday while Roshan goes out of town for a cousin's marriage thus creating an opportunity for Sodhi to party with his friends. However Champaklal's old friend Hemraj convinces him to party with him and some other friends of their young days. Coincidentally, Champaklal arrives at the same bar in which Sodhi was partying with his friends making him think that Champaklal was doing an alcohol party, for which Gokuldham men always faced backlash from their wives and Champaklal. Sodhi tries to convince everyone that Champaklal partied but faced backlash especially from Jethalal. Next day Champaklal faces some acidity due to hangover making Sodhi more determined that he partied. However Jethalal had to leave for Pune for an urgent meeting. Hemraj again convinces Champaklal for the party and the conversation gets overheard by Sodhi. He catches Champaklal red-handed with Popatlal and shows proof to Gokuldham men except Jethalal which came as a shocker for everyone and they get tensed regarding how Jethalal will handle this situation after learning the truth. Eventually, they tell him the truth but due to his failed attempt to ask Champaklal about the same Sodhi asks this in an inebriated state. However, after Jethalal comes back to his senses it is revealed that Hemraj works for rehabilitation of alcohol and drug addicted people and he along with Champaklal and another friend Suresh helps those people to quit alcohol and drugs by acting as addicted people who are facing aftermaths and health complications for this addiction.
3433–3441
"Bhide's Sargam Orchestra"
Jethalal tells everyone how he mistook his shop's junk dealers for thieves due to change in their looks post-Covid eventually irritating Inspector Chalu Pandey again. However Madhavi gets irritated by Bhide constantly postponing his plan to check junk at his home. Next day when the junk dealer arrives Madhavi along with other women of society sell off all their junk to him. However Bhide picks out his old "Sargam Orchestra" (an audio tape gifted to him by his grandfather) and asks Jethalal to get it repaired by Bagha as he wants to listen to his collection of old cassette songs again in that tape. Later Bhide organizes a musical night for the society. However the tape doesn't work so Bagha repairs it again. Then, it is converted into a musical tribute to legendary singers like Lata Mangeshkar, Kishore Kumar, Mohammed Rafi, Mukesh, Bappi Lahiri etc. with their evergreen songs like Ajeeb Dastan Hai Ye, Awaara Hun, O Hasina Zulfon Wali, Yaar Bina Chain Kahan Re etc. The musical night ends with iconic Aye Mere Watan Ke Logo by Lata Mangeshkar and everyone enjoying an ice-cream party.
3442–3450
"Lemon Price Hike of 2022"
Amid the current lemon price hike of 2022, everyone gets tensed regarding the same. However, Bhide receives his first and huge order of 50kg lemon pickles from Rang Tarang Resort, making him tensed how he will arrange money for the same due to price hikes as many of his old customers changed their address and contact post-Covid with whom he can collect his pending payment to buy lemons. But someone sends him 4 bags of lemons. Initially reluctant Bhide decides to sell them off after picking out required quantity of lemons to complete his pickles order. At first Bagha bought them to surprise Jethalal but returns after he refuses to accept them. Then Bhide gets a call from Guddu Khatila that he will buy them. Inspector Chalu Pandey catches him, and it is revealed that the lemons were sent by one of Bhide's pending payment customer Shetty Anna and Guddu Khatila is a black-marketing agent of lemons. It is also revealed that the man caught was Guddu Khatila's henchman and real Guddu Khatila troubles Bhide, Sodhi and Abdul with his goons. However, they succeed in catching everyone with other people's help. Constable Patil helps Bhide to sell off the lemons by giving the contact number of his vegetable vendor uncle.
3451–3454
"Confusion"
Bhide comes back home after writing Suvichaar on society's noticeboard and finds his stamp missing. He accuses Madhavi of being careless with his things but she defends herself by saying that she didn't see it. But Bhide gets adamant and later the stamp falls from his pocket while picking up the phone upsetting Madhavi. He convinces her to go shopping and society's every couple goes for the same. Abdul receives a letter from the municipality and calls Jethalal and Bagha. The trio thinks that the municipality is going to cut their waterline. But Bhide clears that it's just a notice related to contaminated water which can come due to pipeline repair.
3455–3470
"A prospective bride for Popatlal"
Popatlal gets a call from a marriage bureau that a prospective bride named Pratiksha is impressed by his profile and wants to move further with a relationship proposal. Her father informs him that they are big industrialists and like his achievements, but ask him to come with his family. Popat decides to take whole Gokuldham members with him in yellow dress-code as it's Pratiksha's favourite colour. But Bhide suspects foul play. On reaching the prospective bride's house everyone gets confused between her grandmother, younger sister, secretary's wife and househelp but Pratiksha finally comes and shows interest in Popatlal. While Popat immediately agrees for the marriage, Pratiksha sticks to the fact that her parents will finalize the relationship. They agree to give their answer the next morning. Although their answer comes positively, they reveal that Pratiksha is a divorcee and that it's her second marriage. Gokuldham members initially feel skeptical over the relationship but Popat wholeheartedly agrees to the relationship making them feel proud of him and they start preparing for the Roka ceremony of the couple.
"""

def parse_wiki():
    blocks = wiki_text.strip().split('\n\n')
    storylines = []
    
    # Regex to capture episode range, title, and description
    pattern = r'^(\d+(?:–\d+)?)\n"([^"]+)"\n([\s\S]+)$'

    count = 1
    for b in wiki_text.strip().split('\n'):
        pass

    # Regex parse line blocks
    lines = [l.strip() for l in wiki_text.strip().split('\n') if l.strip()]
    
    i = 0
    idx = 1
    while i < len(lines):
        ep_range = lines[i]
        if i + 2 < len(lines) and lines[i+1].startswith('"') and lines[i+1].endswith('"'):
            title = lines[i+1].strip('"')
            desc = lines[i+2]
            
            if '–' in ep_range:
                parts = ep_range.split('–')
                start_ep = int(parts[0])
                end_ep = int(parts[1])
            else:
                start_ep = int(ep_range)
                end_ep = start_ep
                
            total_eps = end_ep - start_ep + 1
            category = "Classic" if start_ep <= 500 else ("Golden" if start_ep <= 1500 else ("Modern" if start_ep <= 3000 else "Recent"))

            storylines.append({
                "id": f"arc_{start_ep}_{title.lower().replace(' ', '_').replace('(', '').replace(')', '').replace('&', 'and')[:25]}",
                "sortOrder": idx,
                "title": title,
                "tagline": f"Official Wikipedia Ground-Truth Arc (Ep {start_ep} - {end_ep})",
                "description": "",
                "startEp": start_ep,
                "endEp": end_ep,
                "totalEpisodes": total_eps,
                "category": category,
                "coverEp": start_ep
            })
            idx += 1
            i += 3
        else:
            i += 1

    out_path = os.path.join(os.path.dirname(__file__), 'storylines.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(storylines, f, indent=2)

    print(f"SUCCESS! Built master storylines.json with {len(storylines)} 100% ground-truth Wikipedia TMKOC arcs!")

if __name__ == '__main__':
    parse_wiki()
