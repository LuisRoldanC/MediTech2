import toast, { Toaster } from "react-hot-toast";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import {
    Connection,
    SystemProgram,
    Transaction,
    PublicKey,
    LAMPORTS_PER_SOL,
    clusterApiUrl,
    SendTransactionError,
} from "@solana/web3.js";
import { useStorageUpload } from "@thirdweb-dev/react";


import axios from "axios";
import { Html } from "next/document";

const SOLANA_NETWORK = "devnet";

const Home = () => {
    const [publicKey, setPublicKey] = useState(null);
    const router = useRouter();
    const [balance, setBalance] = useState(0);
    const [receiver, setReceiver] = useState(null);
    const [amount, setAmount] = useState(null);
    const [explorerLink, setExplorerLink] = useState(null);

    const [uploadUrl, setUploadUrl] = useState(null);
    const [url, setUrl] = useState(null);
    const [statusText, setStatusText] = useState("");

    useEffect(() => {
        let key = window.localStorage.getItem("publicKey"); //obtiene la publicKey del localStorage
        setPublicKey(key);
        if (key) getBalances(key);
        if (explorerLink) setExplorerLink(null);
    }, []);

    const handleReceiverChange = (event) => {
        setReceiver(event.target.value);
    };

    const handleAmountChange = (event) => {
        setAmount(event.target.value);
    };

    const handleSubmit = async () => {
        console.log("Este es el receptor", receiver);
        console.log("Este es el monto", amount);
        sendTransaction();
    };

    const handleUrlChange = (event) => {
        setUrl(event.target.value);
        console.log("Si se esta seteando la URL", url);
    };

    //Funcion para Iniciar sesion con nuestra Wallet de Phantom

    const signIn = async () => {
        //Si phantom no esta instalado 
        const provider = window?.phantom?.solana;
        const { solana } = window;

        if (!provider?.isPhantom || !solana.isPhantom) {
            toast.error("Phantom no esta instalado");
            setTimeout(() => {
                window.open("https://phantom.app/", "_blank");
            }, 2000);
            return;
        }
        //Si phantom esta instalado
        let phantom;
        if (provider?.isPhantom) phantom = provider;

        const { publicKey } = await phantom.connect(); //conecta a phantom
        console.log("publicKey", publicKey.toString()); //muestra la publicKey
        setPublicKey(publicKey.toString()); //guarda la publicKey en el state
        window.localStorage.setItem("publicKey", publicKey.toString()); //guarda la publicKey en el localStorage

        toast.success("Tu Wallet esta conectada 👻");

        getBalances(publicKey);
    };

    //Funcion para cerrar sesion con nuestra Wallet de Phantom

    const signOut = async () => {
        if (window) {
            const { solana } = window;
            window.localStorage.removeItem("publicKey");
            setPublicKey(null);
            solana.disconnect();
            router.reload(window?.location?.pathname);
        }
    };

    //Funcion para obtener el balance de nuestra wallet

    const getBalances = async (publicKey) => {
        try {
            const connection = new Connection(
                clusterApiUrl(SOLANA_NETWORK),
                "confirmed"
            );

            const balance = await connection.getBalance(
                new PublicKey(publicKey)
            );

            const balancenew = balance / LAMPORTS_PER_SOL;
            setBalance(balancenew);
        } catch (error) {
            console.error("ERROR GET BALANCE", error);
            toast.error("Something went wrong getting the balance");
        }
    };

    //Funcion para enviar una transaccion
    const sendTransaction = async () => {
        try {
            //Consultar el balance de la wallet
            getBalances(publicKey);
            console.log("Este es el balance", balance);

            //Si el balance es menor al monto a enviar
            if (balance < amount) {
                toast.error("No tienes suficiente balance");
                return;
            }

            const provider = window?.phantom?.solana;
            const connection = new Connection(
                clusterApiUrl(SOLANA_NETWORK),
                "confirmed"
            );

            //Llaves

            const fromPubkey = new PublicKey(publicKey);
            const toPubkey = new PublicKey(receiver);

            //Creamos la transaccion
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey,
                    toPubkey,
                    lamports: amount * LAMPORTS_PER_SOL,
                })
            );
            console.log("Esta es la transaccion", transaction);

            //Traemos el ultimo blocke de hash
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = fromPubkey;

            //Firmamos la transaccion
            const transactionsignature = await provider.signTransaction(
                transaction
            );

            //Enviamos la transaccion
            const txid = await connection.sendRawTransaction(
                transactionsignature.serialize()
            );
            console.info(`Transaccion con numero de id ${txid} enviada`);

            //Esperamos a que se confirme la transaccion
            const confirmation = await connection.confirmTransaction(txid, {
                commitment: "singleGossip",
            });

            const { slot } = confirmation.value;

            console.info(
                `Transaccion con numero de id ${txid} confirmado en el bloque ${slot}`
            );

            const solanaExplorerLink = `https://explorer.solana.com/tx/${txid}?cluster=${SOLANA_NETWORK}`;
            setExplorerLink(solanaExplorerLink);

            toast.success("Transaccion enviada con exito :D ");

            //Actualizamos el balance
            getBalances(publicKey);
            setAmount(null);
            setReceiver(null);

            return solanaExplorerLink;
        } catch (error) {
            console.error("ERROR SEND TRANSACTION", error);
            toast.error("Error al enviar la transaccion");
        }
    };

    //Función para subir archivos a IPFS

    const { mutateAsync: upload } = useStorageUpload();

    const uploadToIpfs = async (file) => {
        setStatusText("Subiendo a IPFS...");
        const uploadUrl = await upload({
            data: [file],
            options: {
                uploadWithGatewayUrl: true,
                uploadWithoutDirectory: true,
            },
        });
        return uploadUrl[0];
    };

    // URL a Blob
    const urlToBLob = async (file) => {
        setStatusText("Transformando url...");
        await fetch(url)
            .then((res) => res.blob())
            .then((myBlob) => {
                // logs: Blob { size: 1024, type: "image/jpeg" }

                myBlob.name = "blob.png";

                file = new File([myBlob], "image.png", {
                    type: myBlob.type,
                });
            });

        const uploadUrl = await uploadToIpfs(file);
        console.log("uploadUrl", uploadUrl);

        setStatusText(`La url de tu archivo es: ${uploadUrl} `);
        setUploadUrl(uploadUrl);

        return uploadUrl;
    };

    //Funcion para crear un NFT
    const generateNFT = async () => {
        try {
            setStatusText("Creando tu NFT...❤");
            const mintedData = {
                name: "Mi primer NFT con Superteam MX",
                imageUrl: uploadUrl,
                publicKey,
            };
            console.log("Este es el objeto mintedData:", mintedData);
            setStatusText(
                "Minteando tu NFT en la blockchain Solana 🚀 Porfavor espera..."
            );
            const { data } = await axios.post("/api/mintnft", mintedData);
            const { signature: newSignature } = data;
            const solanaExplorerUrl = `https://solscan.io/tx/${newSignature}?cluster=${SOLANA_NETWORK}`;
            console.log("solanaExplorerUrl", solanaExplorerUrl);
            setStatusText(
                "¡Listo! Tu NFT se a creado, revisa tu Phantom Wallet 🖖"
            );
        } catch (error) {
            console.error("ERROR GENERATE NFT", error);
            toast.error("Error al generar el NFT");
        }
    };

    return (
        
        <div className="h-screen bg-white" >
           
<nav class="relative select-none bg-grey lg:flex lg:items-stretch w-full">
  <div class="flex flex-no-shrink items-stretch h-12">
    <a href="#" class="flex-no-grow flex-no-shrink relative py-2 px-4 leading-normal text-black no-underline flex items-center hover:bg-grey-dark">Creacion de nuevos registros</a>
    <button class="block lg:hidden cursor-pointer ml-auto relative w-12 h-12 p-4">
      <svg class="fill-current text-black" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M0 3h20v2H0V3zm0 6h20v2H0V9zm0 6h20v2H0v-2z"/></svg>
      <svg class="fill-current text-black" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M10 8.586L2.929 1.515 1.515 2.929 8.586 10l-7.071 7.071 1.414 1.414L10 11.414l7.071 7.071 1.414-1.414L11.414 10l7.071-7.071-1.414-1.414L10 8.586z"/></svg>
    </button>
  </div>
  <div class="lg:flex lg:items-stretch lg:flex-no-shrink lg:flex-grow">
    <div class="lg:flex lg:items-stretch lg:justify-end ml-auto">
      <a href="#" class="flex-no-grow flex-no-shrink relative py-2 px-4 leading-normal text-black no-underline flex items-center hover:bg-grey-dark">Protegiendo tus datos siempre </a>

    </div>
  </div>
</nav>
            <div className="flex flex-col  w-auto h-auto  bg-white">
                
                
        
              
<div class="flex flex-col bg-white py-4 px-12">
        <div class="py-4">
            <div class="pl-[116px] pr-[205px] py-8">
                <div class="text-7xl text-blue-900">M E D I T E C H</div><br></br>
                <div class="lead-xl font-light ">Ofrecemos un sofware, que garantiza la seguridad de los datos médicos mediante tecnología blockchain, evitando alteraciones maliciosas y asegurando un acceso controlado, brindando eficiencia y privacidad.</div>
            </div>
        </div>
    <div class="flex flex-col px-20 md:px-10 md:flex-row items-center justify-center gap-6">
        <div>
            <img src="https://i.ibb.co/wWyZrCG/1.png" alt="Featured Image 1" class="rounded-t-xl"/>
            <div class="px-9 pt-10 pb-14 bg-gray-900 rounded-b-lg">
                <div class="text-white space-y-4">
                    <h3 class="text-xl font-bold lead-xl bold">SEGURIDAD DE DATOS</h3>
                    <div class="text-lg font-light">Protegemos tus datos atraves de blockchain, una red decentralizada.</div>
                </div>
                <div class="flex justify-between pt-8">
                    <ul class="flex flex-col gap-y-2.5">
                        <li class="flex space-x-3 text-white">
                            <img width="50" height="50" src="https://img.icons8.com/ios-filled/50/FFFFFF/checked--v1.png" alt="checked--v1" class="w-6 h-6"/>
                            <span class="paragraph-l font-bold">Gestion eficiente</span>
                        </li>
                            <li class="flex space-x-3 text-white">
                             <img width="50" height="50" src="https://img.icons8.com/ios-filled/50/FFFFFF/checked--v1.png" alt="checked--v1" class="w-6 h-6"/>
                            <span class="paragraph-l font-bold">Seguridad Inquebrantable</span>
                        </li>
                            <li class="flex space-x-3 text-white">
                             <img width="50" height="50" src="https://img.icons8.com/ios-filled/50/FFFFFF/checked--v1.png" alt="checked--v1" class="w-6 h-6"/>
                            <span class="paragraph-l font-bold">Privacidad protegida</span>
                        </li>
                    </ul>
                    
                </div>
            </div>
        </div> 
        <div class="">
            <img src="https://i.ibb.co/qdg3JSQ/3.png" alt="Featured Image 1" class="rounded-t-xl"/>
            <div class="px-9 pt-10 pb-14 bg-gray-900 rounded-b-lg">
                <div class="text-white space-y-4">
                    <h3 class="text-xl font-bold lead-xl bold">SEGURIDAD PERSONAL</h3>
                    <div class="text-lg font-light">Tendras una vista de tu historial médico,citas médicas,entre otros servicos que estarán protegidos con blockchain. </div>
                </div>
                <div class="flex justify-between pt-8">
                   <ul class="flex flex-col gap-y-2.5">
                        <li class="flex space-x-3 text-white">
                            <img width="50" height="50" src="https://img.icons8.com/ios-filled/50/FFFFFF/checked--v1.png" alt="checked--v1" class="w-6 h-6"/>
                            <span class="paragraph-l font-bold">Historial médico </span>
                        </li>
                            <li class="flex space-x-3 text-white">
                             <img width="50" height="50" src="https://img.icons8.com/ios-filled/50/FFFFFF/checked--v1.png" alt="checked--v1" class="w-6 h-6"/>
                            <span class="paragraph-l font-bold">Registro de citas médicas</span>
                        </li>
                            <li class="flex space-x-3 text-white">
                             <img width="50" height="50" src="https://img.icons8.com/ios-filled/50/FFFFFF/checked--v1.png" alt="checked--v1" class="w-6 h-6"/>
                            <span class="paragraph-l font-bold">Lista de padecimientos</span>
                        </li>
                    </ul>
                   
                </div>
            </div>
        </div> 
    </div>
</div>

                   
                    {publicKey ? (
                        <div className="flex flex-col py-24 place-items-center justify-center">
                            <br />

                            <h1 className="text-xl font-bold lead-xl bold">
                                Tu numero de Wallet es {publicKey}
                            </h1>

                            <br />

                            <h1 className="text-xl font-bold lead-xl bold">
                                Tu balance es {balance} SOL
                            </h1>
                            <br />
                            <h1 className="text-xl font-bold lead-xl bold">
                                Enviar una transaccion a:
                            </h1>

                            <input
                                className="h-8 w-72 mt-4   border-2 border-black "
                                type="text"
                                onChange={handleReceiverChange}
                            />
                            <br />
                            <h1 className="text-xl font-bold lead-xl bold">
                                Cantidad de SOL a enviar:
                            </h1>
                            <input
                                className="h-8 w-72 mt-4   border-2 border-black "
                                type="text"
                                onChange={handleAmountChange}
                            />
                            <br />
                            <button
                                type="submit"
                                className="inline-flex h-8 w-52 justify-center bg-gray-900 font-bold text-white"
                                onClick={() => {
                                    handleSubmit();
                                }}
                            >
                                DONACION ⚡
                            </button>
                            <br />

                            <a href={explorerLink}>
                                <h1 className="text-md font-bold text-sky-500">
                                    {explorerLink}
                                </h1>
                            </a>
                            <br />

                            <h1 className="text-xl font-bold lead-xl bold">
                                Url del registro:
                            </h1>

                            <input
                                className="h-8 w-52 mt-4 border-2 border-black"
                                type="float"
                                onChange={handleUrlChange}
                            />
                            <br />
                            <button
                                className="inline-flex h-8 w-52 justify-center bg-gray-900 font-bold text-white"
                                onClick={() => {
                                    urlToBLob();
                                }}
                            >
                                COMPROBANTE
                            </button>

                            <br />

                            <p className="text-white font-bold mb-8">
                                {statusText}
                            </p>

                            <br />

                            {uploadUrl ? (
                                <button
                                    className="inline-flex h-8 w-52 justify-center bg-gray-900 font-bold text-white"
                                    onClick={() => {
                                        generateNFT();
                                    }}
                                >
                                    Crear registro 🔥
                                </button>
                            ) : (
                                <button
                                    className="inline-flex h-8 w-auto justify-center bg-gray-900 font-bold text-white"
                                    onClick={() => {
                                        toast.error(
                                            "Primero sube una imagen a IPFS"
                                        );
                                    }}
                                >
                                    SUBIR COMPROBANTE ⚠
                                </button>
                            )}

                            <br />
                            <button
                                type="submit"
                                className="inline-flex h-8 w-52 justify-center bg-gray-900 font-bold text-white"
                                onClick={() => {
                                    signOut();
                                }}
                            >
                                Desconecta tu wallet 👻
                            </button>
                        </div>
                    ) : (
                        
                        <div className="flex flex-col place-items-center justify-center">
                            <button
                                type="submit"
                                className="inline-flex h-8 w-52 justify-center bg-gray-900 font-bold text-white"
                                onClick={() => {
                                    signIn();
                                }}
                            >
                                Conecta tu wallet 👻
                                
                            </button>
                            
                        </div>
                    )}
                </div>
            
<div class="max-w-2xl mx-auto">

	<footer class="p-4 bg-white rounded-lg shadow md:px-6 md:py-8 dark:bg-gray-800">
		<div class="sm:flex sm:items-center sm:justify-between">
			<a href="#" target="_blank" class="flex items-center mb-4 sm:mb-0">
				<img src="https://i.ibb.co/q5v8nvV/MEDITECH.png" class="mr-4 h-8" alt="Flowbite Logo" />
				<span class="self-center text-xl font-semibold whitespace-nowrap dark:text-white">MEDITECH</span>
			</a>
			<ul class="flex flex-wrap items-center mb-6 sm:mb-0">
				<li>
					<a href="#" class="mr-4 text-sm text-gray-500 hover:underline md:mr-6 dark:text-gray-400">About</a>
				</li>
				<li>
					<a href="#" class="mr-4 text-sm text-gray-500 hover:underline md:mr-6 dark:text-gray-400">Privacy
						Policy</a>
				</li>
				<li>
					<a href="#"
						class="mr-4 text-sm text-gray-500 hover:underline md:mr-6 dark:text-gray-400">Licensing</a>
				</li>
				<li>
					<a href="#" class="text-sm text-gray-500 hover:underline dark:text-gray-400">Contact</a>
				</li>
			</ul>
		</div>
		<hr class="my-6 border-gray-200 sm:mx-auto dark:border-gray-700 lg:my-8" />
		<span class="block text-sm text-gray-500 sm:text-center dark:text-gray-400">© 2023 <a href="C:\Users\Wiches\Haka\test4\MEDITECH.png" target="_blank" class="hover:underline">MEDITECH™</a>. All Rights Reserved.
    </span>
	</footer>

	<p class="mt-5">This footer component is part of a larger, open-source library of Tailwind CSS components. Learn
		more
		by going to the official <a class="text-blue-600 hover:underline"
			href="#" target="_blank">MEDITECH Documentation</a>.
	</p>
</div>
                <Toaster position="bottom-center" />
                
                
            </div>
          
    );
    
};

export default Home;
