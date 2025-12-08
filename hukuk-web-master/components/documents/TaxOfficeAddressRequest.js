import React from "react";
import { DEBTOR_TYPES } from "../../constants";

export default function TaxOfficeAddressRequest({
  currentCase,
  lawyers,
  clients,
  debtors,
  dues,
  executionOffice
}) {
  let generalAmount = 0;
  dues.map(due => (generalAmount += due.totalAmount));

  return (
    <div>
      <page size="A4" id="printSection">
        <div className="flex al-center jst-between">
          <div className="w-50 ta-center bold">
            <p>T.C.</p>
            <p>{executionOffice.city.toUpperCase()}</p>
            <p>{executionOffice.name.toUpperCase()} MÜDÜRLÜĞÜ</p>
            <p>{currentCase.executionFileNumber}</p>
          </div>
        </div>
        <p className="my-4 fw-500 ta-center">
          AYDIN VERGİ DAİRESİ BAŞKANLIĞINA
        </p>
        <div className="flex mb-4">
          <p className="w-30 mr-4 fs-xsm">Alacaklı</p>
          <p className="w-70 fs-xsm">
            {clients.map(client => {
              return (
                <div key={client._id} className="mb-2">
                  <p>
                    <span className="fw-500">
                      {client.name} {client.surname}
                    </span>
                    (T.C. Kimlik No: {client.identityNumber})
                  </p>
                  <p>
                    {client.addresses.map(address => {
                      return <span>{address.description}</span>;
                    })}
                  </p>
                </div>
              );
            })}
          </p>
        </div>
        <div className="flex mb-4">
          <p className="w-30 mr-4 fs-xsm">Vekilleri</p>
          <p className="w-70 fs-xsm">
            {lawyers.map((lawyer, index) => {
              const isLast = index === lawyers.length - 1;
              return (
                <span>
                  AV. {lawyer.name} {lawyer.surname} {!isLast ? "&" : ""}
                </span>
              );
            })}
          </p>
        </div>
        <div className="flex mb-4">
          <p className="w-30 mr-4 fs-xsm">Borçlular</p>
          <p className="w-70 fs-xsm">
            {debtors.map(debtor => {
              return (
                <div>
                  <p>
                    {debtor.type === DEBTOR_TYPES.PERSON ? (
                      <React.Fragment>
                        <span className="fw-500">
                          {debtor.name} {debtor.surname}
                        </span>
                        {debtor.identityNumber !== "" && (
                          <span>
                            (T.C. Kimlik Numarası: {debtor.identityNumber})
                          </span>
                        )}
                      </React.Fragment>
                    ) : (
                      <React.Fragment>
                        <span className="fw-500">{debtor.institutionName}</span>
                        {debtor.taxNumber !== "" && (
                          <span>(Vergi Numarası: {debtor.taxNumber})</span>
                        )}
                      </React.Fragment>
                    )}{" "}
                  </p>
                  <p>
                    {debtor.addresses.map(address => {
                      return <p>{address.description}</p>;
                    })}
                  </p>
                </div>
              );
            })}
          </p>
        </div>
        <div className="flex mb-4">
          <p className="w-30 mr-4 fs-xsm">BORÇ MİKTARI</p>
          <p className="w-70 fs-xsm">
            <p className="bold mb-2">
              {generalAmount} TRY (Faiz ve masraflar hariç)
            </p>
          </p>
        </div>
        <p className="mb-4 fs-xsm ta-center">
          Yukarda tarafları yazılı icra takibi gereğince, adı soyadı yazılı
          dosyamız borçlusunun adres bilgilerine göre nüfus bilgilerinin T.C
          kimlik numarasının tebliğe yarar adreslerinin bildirilmesine karar
          verilmiştir. Karar gereği işlem yapılması ve neticeden müdürlüğümüze
          bilgi verilmesi rica olunur.
        </p>
        <div className="flex jst-between">
          <div className="w-50"></div>
          <div className="w-50 flex column al-center jst-center">
            <p>
              {executionOffice.city} {executionOffice.name} MÜDÜRLÜĞÜ
            </p>
          </div>
        </div>
      </page>
    </div>
  );
}
